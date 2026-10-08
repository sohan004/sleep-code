import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "rails",
  project: "freight-dispatch",
  branch: "feat/carrier-pickup-booking",
  indent: "Spaces: 2",
  files: [
    "app/controllers/api/v1/shipments_controller.rb",
    "app/controllers/application_controller.rb",
    "app/models/current.rb",
    "app/models/parcel.rb",
    "app/models/shipment.rb",
    "app/services/carrier_gateway.rb",
    "config/routes.rb",
    "db/schema.rb",
    "test/models/shipment_test.rb",
  ],
  snippets: [
    {
      filename: "app/controllers/api/v1/shipments_controller.rb",
      syntax: "hash",
      languageLabel: "Ruby",
      code: `# frozen_string_literal: true

module Api
  module V1
    class ShipmentsController < ApplicationController
      before_action :set_shipment, only: %i[show update book_pickup]
      before_action :require_dispatcher!, only: :book_pickup

      rate_limit to: 30, within: 1.minute, only: :create, by: -> { Current.user.id }

      # GET /api/v1/shipments
      def index
        shipments = Current.account.shipments
          .includes(:carrier, :destination, :parcels)
          .status_filter(params[:status])
          .order(created_at: :desc)
          .limit(page_size)
          .offset(page_offset)

        render json: ShipmentSerializer.many(shipments)
      end

      def show
        render json: ShipmentSerializer.one(@shipment)
      end

      def create
        shipment = Current.account.shipments.build(shipment_params)
        shipment.created_by = Current.user

        if shipment.save
          render json: ShipmentSerializer.one(shipment), status: :created
        else
          render json: { errors: shipment.errors }, status: :unprocessable_content
        end
      end

      def update
        if @shipment.update(shipment_params)
          render json: ShipmentSerializer.one(@shipment)
        else
          render json: { errors: @shipment.errors }, status: :unprocessable_content
        end
      end

      def book_pickup
        @shipment.book_pickup!(requested_by: Current.user, window: pickup_window)
        render json: ShipmentSerializer.one(@shipment.reload)
      rescue Shipment::InvalidTransition => e
        render json: { error: e.message }, status: :conflict
      end

      private

      # Scoped through the account, so another tenant's ID raises RecordNotFound (404)
      def set_shipment
        @shipment = Current.account.shipments.find(params.expect(:id))
      end

      def require_dispatcher!
        head :forbidden unless Current.user.dispatcher?
      end

      def shipment_params
        params.expect(shipment: [
          :reference, :service_level, :destination_id,
          { parcels_attributes: [%i[id weight_grams length_mm width_mm height_mm _destroy]] }
        ])
      end

      def pickup_window
        window = params.expect(pickup: %i[from to])
        Time.zone.parse(window[:from])..Time.zone.parse(window[:to])
      end

      def page_size
        params.fetch(:per_page, 25).to_i.clamp(1, 100)
      end

      def page_offset
        (params.fetch(:page, 1).to_i.clamp(1, 10_000) - 1) * page_size
      end
    end
  end
end
`,
    },
    {
      filename: "app/models/shipment.rb",
      syntax: "hash",
      languageLabel: "Ruby",
      code: `# frozen_string_literal: true

class Shipment < ApplicationRecord
  class InvalidTransition < StandardError; end

  belongs_to :account
  belongs_to :carrier, optional: true
  belongs_to :destination, class_name: "Address"
  belongs_to :created_by, class_name: "User"
  belongs_to :pickup_booked_by, class_name: "User", optional: true
  has_many :parcels, dependent: :destroy, inverse_of: :shipment
  has_many :tracking_events, through: :parcels

  accepts_nested_attributes_for :parcels, allow_destroy: true, limit: 50

  enum :status, {
    draft: 0, ready: 1, pickup_booked: 2, in_transit: 3, delivered: 4, cancelled: 5
  }, default: :draft, validate: true

  enum :service_level, {
    standard: "standard", express: "express", overnight: "overnight"
  }, prefix: :service, validate: true

  normalizes :reference, with: ->(ref) { ref.strip.upcase }

  validates :reference, presence: true, length: { maximum: 40 },
                        uniqueness: { scope: :account_id }
  validates :parcels, presence: true, unless: :draft?
  validate :destination_belongs_to_account

  scope :status_filter, ->(status) { statuses.key?(status) ? where(status:) : all }
  scope :awaiting_pickup, -> { pickup_booked.where(pickup_from: ..Time.current) }

  def total_weight_grams
    parcels.sum(&:weight_grams)
  end

  def book_pickup!(requested_by:, window:)
    raise InvalidTransition, "Pickup window is invalid" if window.begin.nil? || window.end.nil?
    raise InvalidTransition, "Pickup window must be in the future" if window.begin.past?

    with_lock do
      raise InvalidTransition, "Shipment must be ready before booking a pickup" unless ready?

      carrier_ref = CarrierGateway.for(carrier).book_pickup(
        reference:, window:, weight_grams: total_weight_grams
      )

      update!(
        status: :pickup_booked,
        pickup_from: window.begin,
        pickup_to: window.end,
        carrier_booking_ref: carrier_ref,
        pickup_booked_by: requested_by
      )
    end

    ShipmentMailer.with(shipment: self).pickup_booked.deliver_later
  end

  def cancel!
    with_lock do
      raise InvalidTransition, "Delivered shipments cannot be cancelled" if delivered?

      update!(status: :cancelled)
    end
  end

  private

  # destination_id comes from params, so make sure it isn't another tenant's address
  def destination_belongs_to_account
    return if destination.nil? || destination.account_id == account_id

    errors.add(:destination, "must belong to the same account")
  end
end
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Can you sanity-check `book_pickup!`? I moved the `ready?` check inside `with_lock` after a double-booking bug.",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Moving it inside was the right fix. `with_lock` opens a transaction, runs `SELECT ... FOR UPDATE` and reloads the record, so the second request sees `pickup_booked` and raises instead of booking twice.\n\nThe remaining problem is **the HTTP call inside the lock**. `CarrierGateway#book_pickup` holds a database transaction and a row lock open for as long as the carrier API takes, and that could be seconds. Worse, if `update!` then fails, the transaction rolls back but the carrier booking still exists.\n\nA safer sequence:\n1. Inside the lock, move to an intermediate `pickup_requested` status and commit.\n2. Call the carrier outside the transaction, ideally from a job with retries.\n3. Record `carrier_booking_ref` and move to `pickup_booked` when it succeeds, or back to `ready` if it fails.",
      delay: 13000,
    },
    {
      role: "user",
      content:
        "Makes sense. Is `index` OK for N+1? The serialiser shows the parcel count and total weight.",
      delay: 27000,
    },
    {
      role: "assistant",
      content:
        "`includes(:carrier, :destination, :parcels)` preloads all three, so the list itself is fine. Watch how the serialiser reads them, though:\n\n- `parcels.size` and `parcels.sum(&:weight_grams)` use the preloaded records, so they're safe.\n- `parcels.count` or `parcels.sum(:weight_grams)` always run SQL, which means one query per shipment even with `includes`.\n\n`total_weight_grams` uses the block form, so it's safe as long as nobody changes it to the column form. To catch regressions early, turn on strict loading for this endpoint:\n\n```ruby\nCurrent.account.shipments.strict_loading.includes(...)\n```\n\nAny association you forgot to preload then raises `ActiveRecord::StrictLoadingViolationError` in tests instead of quietly adding queries.",
      delay: 39000,
    },
    {
      role: "user",
      content:
        "Last one: `pickup_window` parses whatever the client sends. Any edge cases?",
      delay: 53000,
    },
    {
      role: "assistant",
      content:
        "A few:\n1. `Time.zone.parse` returns `nil` for unparseable input, which gives you `nil..nil`. The model catches that with the `begin.nil?` guard, so you get a 409 rather than a 500. A 422 would arguably be more accurate.\n2. **Reversed ranges.** `from` after `to` passes every current check. Add `raise InvalidTransition, \"...\" if window.begin >= window.end`.\n3. **Time zones.** Strings without an offset are read in `Time.zone`, which is the app's zone, not the dispatcher's. Require ISO 8601 with an offset, or set `Time.zone` per request from the account's settings.\n4. `params.expect(pickup: %i[from to])` already returns 400 if `pickup` is missing or isn't a hash, so that case is handled.",
      delay: 64000,
    },
  ],
};

export default config;
