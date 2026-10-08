import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "sinatra",
  project: "status-page-api",
  branch: "feat/incident-updates",
  indent: "Spaces: 2",
  files: [
    "app/db.rb",
    "app/helpers/auth_helpers.rb",
    "app/models/component.rb",
    "app/models/incident.rb",
    "app/models/incident_update.rb",
    "app/routes/incidents.rb",
    "config.ru",
    "Gemfile",
    "spec/routes/incidents_spec.rb",
  ],
  snippets: [
    {
      filename: "app/routes/incidents.rb",
      syntax: "hash",
      languageLabel: "Ruby",
      code: `# frozen_string_literal: true

require "sinatra/base"
require "sinatra/json"
require "json"
require_relative "../helpers/auth_helpers"
require_relative "../models/component"
require_relative "../models/incident"

module StatusPage
  module Routes
    class Incidents < Sinatra::Base
      MAX_BODY_BYTES = 64 * 1024

      helpers Sinatra::JSON
      helpers StatusPage::AuthHelpers

      configure do
        set :show_exceptions, false
        set :raise_errors, false
      end

      before { content_type :json }

      error Sequel::ValidationFailed do
        halt 422, json(errors: env["sinatra.error"].errors)
      end

      error Sequel::NoMatchingRow do
        halt 404, json(error: "Not found")
      end

      error Incident::AlreadyResolved do
        halt 409, json(error: env["sinatra.error"].message)
      end

      get "/incidents" do
        limit = params.fetch("limit", 20).to_i.clamp(1, 100)
        incidents = Incident.recent.eager(:components).limit(limit).all

        json(incidents: incidents.map(&:to_api))
      end

      get "/incidents/:id" do
        incident = Incident.with_pk!(params["id"].to_i)
        json(incident.to_api(include_updates: true))
      end

      post "/incidents" do
        require_role!(:responder)
        payload = parse_json_body

        incident = Incident.open!(
          title: payload["title"],
          impact: payload["impact"],
          component_ids: Array(payload["component_ids"]).map(&:to_i),
          opened_by: current_user.id
        )

        status 201
        json(incident.to_api)
      end

      post "/incidents/:id/updates" do
        require_role!(:responder)
        incident = Incident.with_pk!(params["id"].to_i)
        payload = parse_json_body

        entry = incident.post_update!(
          status: payload["status"],
          body: payload["body"],
          author_id: current_user.id
        )

        status 201
        json(entry.to_api)
      end

      helpers do
        # Read one byte past the limit so oversized bodies are rejected without buffering them
        def parse_json_body
          raw = request.body.read(MAX_BODY_BYTES + 1).to_s
          halt 413, json(error: "Request body too large") if raw.bytesize > MAX_BODY_BYTES

          data = JSON.parse(raw)
          halt 400, json(error: "Expected a JSON object") unless data.is_a?(Hash)
          data
        rescue JSON::ParserError
          halt 400, json(error: "Malformed JSON")
        end
      end
    end
  end
end
`,
    },
    {
      filename: "app/models/incident.rb",
      syntax: "hash",
      languageLabel: "Ruby",
      code: `# frozen_string_literal: true

require "sequel"
require_relative "../db"
require_relative "incident_update"

module StatusPage
  class Incident < Sequel::Model(:incidents)
    class AlreadyResolved < StandardError; end

    IMPACTS = %w[none minor major critical].freeze
    STATUSES = %w[investigating identified monitoring resolved].freeze

    plugin :timestamps, update_on_create: true
    plugin :validation_helpers

    many_to_many :components, join_table: :incident_components
    one_to_many :updates, class: "StatusPage::IncidentUpdate", order: Sequel.desc(:created_at)

    dataset_module do
      def recent
        reverse(:opened_at)
      end

      def unresolved
        exclude(status: "resolved")
      end
    end

    def self.open!(title:, impact:, component_ids:, opened_by:)
      db.transaction do
        incident = create(
          title: title.to_s.strip,
          impact:,
          status: "investigating",
          opened_by:,
          opened_at: Time.now.utc
        )
        Component.where(id: component_ids).each { |c| incident.add_component(c) }
        incident
      end
    end

    def post_update!(status:, body:, author_id:)
      raise AlreadyResolved, "Incident #{id} is already resolved" if resolved?

      db.transaction do
        entry = add_update(status:, body: body.to_s.strip, author_id:)
        update(status:, resolved_at: status == "resolved" ? Time.now.utc : nil)
        entry
      end
    end

    def resolved?
      status == "resolved"
    end

    def validate
      super
      validates_presence %i[title impact status opened_by]
      validates_max_length 140, :title
      validates_includes IMPACTS, :impact
      validates_includes STATUSES, :status
    end

    def to_api(include_updates: false)
      data = {
        id:,
        title:,
        impact:,
        status:,
        opened_at: opened_at&.iso8601,
        resolved_at: resolved_at&.iso8601,
        components: components.map { |c| { id: c.id, name: c.name } }
      }
      data[:updates] = updates.map(&:to_api) if include_updates
      data
    end
  end
end
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "The public status page polls `GET /incidents` every 30 seconds. Will it hold up once we have a few hundred incidents?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Query-wise, yes. `eager(:components)` loads every component for the page in one extra query, so `to_api` doesn't trigger a lookup per incident. That's two queries in total, whatever the `limit`.\n\nTo keep it fast as data grows:\n1. **Index `opened_at`.** `recent` is `ORDER BY opened_at DESC LIMIT n`. With an index, Postgres reads the first n entries and stops. Without one, it sorts the whole table.\n2. **Cache at the edge.** Every viewer polls the same data, so add `cache_control :public, max_age: 15` and an `etag` based on `Incident.max(:updated_at)`. Most polls then end as a 304 at the CDN.\n3. Don't add `:updates` to the eager list here. The list view never shows updates, so you'd load them for nothing.",
      delay: 12000,
    },
    {
      role: "user",
      content:
        "In `post_update!`, is there a race if two responders post at the same time?",
      delay: 25000,
    },
    {
      role: "assistant",
      content:
        "Yes. `resolved?` is checked **outside** the transaction against the in-memory row. Two responders can both see `monitoring`, and one posts `resolved` while the other posts `identified` a moment later. The incident ends up unresolved with a stale status, even though the timeline shows it was resolved.\n\nLock and re-read inside the transaction:\n\n```ruby\ndb.transaction do\n  lock!\n  raise AlreadyResolved, \"Incident #{id} is already resolved\" if resolved?\n  # ...\nend\n```\n\n`lock!` reloads the row with `SELECT ... FOR UPDATE`, so the second request waits and then sees `resolved`. The `update` call also validates `status` against `STATUSES`, so a typo raises `ValidationFailed` and the whole transaction, including the new entry, rolls back.",
      delay: 37000,
    },
    {
      role: "user",
      content:
        "Good. What's worth covering in `incidents_spec.rb` with `Rack::Test`?",
      delay: 51000,
    },
    {
      role: "assistant",
      content:
        "Focus on the boundaries:\n1. **Auth.** `POST /incidents` without the responder role returns 403 and creates no row. Assert `Incident.count` is unchanged.\n2. **Body handling.** Send a 70 KB payload and expect 413. Send `[1, 2]` and expect 400 (\"Expected a JSON object\"). Send broken JSON and expect 400.\n3. **Validation.** An unknown `impact` returns 422 with an `errors` hash, and nothing is left behind in `incident_components`, which proves the transaction rolled back.\n4. **Not found.** `GET /incidents/abc` returns 404. `\"abc\".to_i` is `0`, which `with_pk!` doesn't find.\n\nWrap each example in `DB.transaction(rollback: :always, auto_savepoint: true)` so specs stay isolated without truncating tables.",
      delay: 63000,
    },
  ],
};

export default config;
