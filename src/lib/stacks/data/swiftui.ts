import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "swiftui",
  project: "wayfarer-ios",
  branch: "feat/trip-archive",
  indent: "Spaces: 4",
  files: [
    "Wayfarer/WayfarerApp.swift",
    "Wayfarer/Info.plist",
    "Wayfarer/Features/Trips/TripListView.swift",
    "Wayfarer/Features/Trips/TripListModel.swift",
    "Wayfarer/Features/Trips/TripDetailView.swift",
    "Wayfarer/Services/TripCache.swift",
    "Wayfarer/Services/RemoteTripService.swift",
    "WayfarerTests/TripListModelTests.swift",
  ],
  snippets: [
    {
      filename: "Wayfarer/Features/Trips/TripListView.swift",
      syntax: "clike",
      languageLabel: "Swift",
      code: `import SwiftUI

struct TripListView: View {
    @State private var model: TripListModel

    init(model: TripListModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Trips")
                .searchable(text: $model.searchText, prompt: "Search trips")
                .refreshable { await model.load() }
                .task { await model.load() }
                .navigationDestination(for: Trip.self) { trip in
                    TripDetailView(trip: trip)
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .failed(let message) where model.trips.isEmpty:
            ContentUnavailableView {
                Label("Trips unavailable", systemImage: "airplane.circle")
            } description: {
                Text(message)
            } actions: {
                Button("Try again") { Task { await model.load() } }
            }
        case .loading where model.trips.isEmpty:
            ProgressView("Loading trips")
        default:
            List {
                section("Upcoming", trips: model.upcoming)
                section("Past", trips: model.past)
            }
            .listStyle(.insetGrouped)
        }
    }

    @ViewBuilder
    private func section(_ title: LocalizedStringKey, trips: [Trip]) -> some View {
        if !trips.isEmpty {
            Section(title) {
                ForEach(trips) { trip in
                    NavigationLink(value: trip) {
                        TripRow(trip: trip)
                    }
                    .swipeActions {
                        Button("Archive", systemImage: "archivebox") {
                            Task { await model.archive(trip) }
                        }
                        .tint(.orange)
                    }
                }
            }
        }
    }
}

private struct TripRow: View {
    let trip: Trip

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(trip.name)
                .font(.headline)
            Text(trip.destination)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(trip.startDate, format: .dateTime.day().month(.abbreviated).year())
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Shows trip details")
    }
}

#Preview {
    TripListView(model: TripListModel(service: PreviewTripService(), cache: .inMemory))
}
`,
    },
    {
      filename: "Wayfarer/Features/Trips/TripListModel.swift",
      syntax: "clike",
      languageLabel: "Swift",
      code: `import Foundation
import Observation
import OSLog

struct Trip: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var name: String
    var destination: String
    var startDate: Date
    var endDate: Date
    var isArchived: Bool
}

protocol TripService: Sendable {
    func fetchTrips() async throws -> [Trip]
    func archive(_ id: Trip.ID) async throws
}

@MainActor
@Observable
final class TripListModel {
    enum LoadState: Equatable {
        case idle, loading, loaded, failed(String)
    }

    private(set) var trips: [Trip] = []
    private(set) var state: LoadState = .idle
    var searchText = ""

    @ObservationIgnored private let service: any TripService
    @ObservationIgnored private let cache: TripCache
    @ObservationIgnored private let log = Logger(subsystem: "app.wayfarer", category: "trips")

    init(service: any TripService, cache: TripCache) {
        self.service = service
        self.cache = cache
    }

    var upcoming: [Trip] {
        filtered.filter { $0.endDate >= .now && !$0.isArchived }
    }

    var past: [Trip] {
        filtered.filter { $0.endDate < .now || $0.isArchived }
    }

    private var filtered: [Trip] {
        guard !searchText.isEmpty else { return trips }
        return trips.filter {
            $0.name.localizedStandardContains(searchText)
                || $0.destination.localizedStandardContains(searchText)
        }
    }

    func load() async {
        if trips.isEmpty { trips = await cache.read() }
        state = .loading
        do {
            let fresh = try await service.fetchTrips()
            trips = fresh.sorted { $0.startDate < $1.startDate }
            state = .loaded
            await cache.write(trips)
        } catch is CancellationError {
            log.debug("Trip load cancelled")
            state = .loaded
        } catch {
            log.error("Trip load failed: \\(error.localizedDescription, privacy: .public)")
            state = trips.isEmpty ? .failed(error.localizedDescription) : .loaded
        }
    }

    func archive(_ trip: Trip) async {
        guard let index = trips.firstIndex(where: { $0.id == trip.id }) else { return }
        trips[index].isArchived = true
        do {
            try await service.archive(trip.id)
        } catch {
            trips[index].isArchived = false
            log.error("Archive failed for \\(trip.id, privacy: .private)")
            state = .failed(String(localized: "Couldn't archive \\(trip.name)."))
        }
    }
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Is it fine to hold an `@Observable` model in `@State` and pass it in through `init`?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Yes, with one caveat. `@State` with an `@Observable` class is the Observation-era replacement for `@StateObject`: SwiftUI stores the instance and keeps it across view updates.\n\nThe caveat is that `State(initialValue:)` only uses the value the **first** time the view's identity is created. If the parent later passes a different `TripListModel`, it's silently ignored. That's what you want for a root screen, but surprising if the parent recreates models.\n\nAlso note the initialiser expression still runs on every parent re-render, so keep `TripListModel.init` cheap - no network calls there. Your `load()` in `.task` is the right place for that.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Is there a bug in `archive`? It feels off after the await.",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Yes. `index` is captured before `try await service.archive`. The model is `@MainActor`, but actor isolation doesn't stop other main-actor work from running during the suspension. If `load()` finishes in the meantime (pull-to-refresh, say), `trips` is replaced and re-sorted, so on failure `trips[index]` may un-archive the **wrong** trip, or crash if the array shrank.\n\nLook the trip up again after the await:\n```swift\nif let i = trips.firstIndex(where: { $0.id == trip.id }) {\n    trips[i].isArchived = false\n}\n```\nSame rule applies anywhere you hold an index across a suspension point.",
      delay: 36000,
    },
    {
      role: "user",
      content: "What does `.task` do if the user navigates away mid-load?",
      delay: 48000,
    },
    {
      role: "assistant",
      content:
        "`.task` cancels its task when the view disappears. Cancellation is cooperative, so what happens next depends on the service:\n1. If `fetchTrips()` uses `URLSession.data(for:)`, the request is cancelled and it throws `URLError(.cancelled)`, **not** `CancellationError`. That lands in your generic `catch`, logs an error and may set `.failed`.\n2. Your `catch is CancellationError` branch only fires if something calls `Task.checkCancellation()`.\n\nTo handle both, check `Task.isCancelled` at the top of the generic catch and return early, so an abandoned load never shows an error state the next time the screen appears.",
      delay: 60000,
    },
  ],
};

export default config;
