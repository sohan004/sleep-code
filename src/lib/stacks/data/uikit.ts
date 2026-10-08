import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "uikit",
  project: "stockroom-ios",
  branch: "fix/inventory-reconfigure",
  indent: "Spaces: 4",
  files: [
    "Stockroom/AppDelegate.swift",
    "Stockroom/SceneDelegate.swift",
    "Stockroom/Info.plist",
    "Stockroom/Inventory/InventoryViewController.swift",
    "Stockroom/Inventory/InventoryStore.swift",
    "Stockroom/Inventory/ItemDetailViewController.swift",
    "StockroomTests/InventoryStoreTests.swift",
  ],
  snippets: [
    {
      filename: "Stockroom/Inventory/InventoryViewController.swift",
      syntax: "clike",
      languageLabel: "Swift",
      code: `import UIKit

final class InventoryViewController: UIViewController {
    private enum Section: Hashable {
        case lowStock, inStock
    }

    private var collectionView: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<Section, InventoryItem.ID>!
    private var items: [InventoryItem.ID: InventoryItem] = [:]
    private var loadTask: Task<Void, Never>?
    private let store: InventoryStore

    init(store: InventoryStore) {
        self.store = store
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = String(localized: "Inventory")
        let config = UICollectionLayoutListConfiguration(appearance: .insetGrouped)
        let layout = UICollectionViewCompositionalLayout.list(using: config)
        collectionView = UICollectionView(frame: view.bounds, collectionViewLayout: layout)
        collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        collectionView.delegate = self
        view.addSubview(collectionView)
        configureDataSource()
        let refresh = UIRefreshControl()
        refresh.addAction(UIAction { [weak self] _ in self?.reload() }, for: .valueChanged)
        collectionView.refreshControl = refresh
        reload()
    }

    private func configureDataSource() {
        let cellRegistration = UICollectionView.CellRegistration<
            UICollectionViewListCell, InventoryItem
        > { cell, _, item in
            var content = cell.defaultContentConfiguration()
            content.text = item.name
            content.secondaryText = "SKU \\(item.sku) · \\(item.quantity) on hand"
            content.secondaryTextProperties.color = item.isLowStock ? .systemRed : .secondaryLabel
            cell.contentConfiguration = content
            cell.accessories = [.disclosureIndicator()]
        }
        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) {
            [weak self] collectionView, indexPath, id in
            guard let item = self?.items[id] else { return nil }
            return collectionView.dequeueConfiguredReusableCell(
                using: cellRegistration, for: indexPath, item: item)
        }
    }

    private func reload() {
        loadTask?.cancel()
        loadTask = Task { [weak self] in
            guard let self else { return }
            defer { collectionView.refreshControl?.endRefreshing() }
            do {
                apply(try await store.fetchItems())
            } catch is CancellationError {
                return
            } catch {
                presentError(error)
            }
        }
    }

    private func apply(_ fetched: [InventoryItem]) {
        let previous = items
        items = Dictionary(uniqueKeysWithValues: fetched.map { ($0.id, $0) })
        var snapshot = NSDiffableDataSourceSnapshot<Section, InventoryItem.ID>()
        snapshot.appendSections([.lowStock, .inStock])
        snapshot.appendItems(fetched.filter(\\.isLowStock).map(\\.id), toSection: .lowStock)
        snapshot.appendItems(fetched.filter { !$0.isLowStock }.map(\\.id), toSection: .inStock)
        // IDs are stable, so changed contents need an explicit reconfigure
        let changed = fetched.filter { item in previous[item.id].map { $0 != item } ?? false }
        snapshot.reconfigureItems(changed.map(\\.id))
        dataSource.apply(snapshot, animatingDifferences: !previous.isEmpty)
    }

    private func presentError(_ error: Error) {
        let alert = UIAlertController(title: String(localized: "Couldn't refresh"),
                                      message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: String(localized: "OK"), style: .default))
        present(alert, animated: true)
    }
}

extension InventoryViewController: UICollectionViewDelegate {
    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        collectionView.deselectItem(at: indexPath, animated: true)
        guard let id = dataSource.itemIdentifier(for: indexPath),
              let item = items[id] else { return }
        let detail = ItemDetailViewController(item: item)
        navigationController?.pushViewController(detail, animated: true)
    }
}
`,
    },
    {
      filename: "Stockroom/Inventory/InventoryStore.swift",
      syntax: "clike",
      languageLabel: "Swift",
      code: `import Foundation

struct InventoryItem: Identifiable, Hashable, Codable, Sendable {
    let id: UUID
    var sku: String
    var name: String
    var quantity: Int
    var reorderLevel: Int

    var isLowStock: Bool { quantity <= reorderLevel }
}

enum InventoryError: LocalizedError {
    case badStatus(Int)
    case missingConfiguration

    var errorDescription: String? {
        switch self {
        case .badStatus(let code): "The server responded with status \\(code)."
        case .missingConfiguration: "The inventory API base URL is not configured."
        }
    }
}

actor InventoryStore {
    private let session: URLSession
    private let baseURL: URL
    private let cacheURL: URL

    init(session: URLSession = .shared) throws {
        // Set per build configuration via an xcconfig, read from Info.plist
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "InventoryAPIBaseURL") as? String,
            let url = URL(string: raw)
        else { throw InventoryError.missingConfiguration }
        self.session = session
        self.baseURL = url
        self.cacheURL = URL.cachesDirectory.appending(path: "inventory.json")
    }

    func fetchItems() async throws -> [InventoryItem] {
        var request = URLRequest(url: baseURL.appending(path: "v1/items"))
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15
        do {
            let (data, response) = try await session.data(for: request)
            try Self.validate(response)
            let items = try JSONDecoder().decode([InventoryItem].self, from: data)
            try? data.write(to: cacheURL, options: .atomic)
            return items.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        } catch let error as URLError where error.code == .notConnectedToInternet {
            if let cached = try? cachedItems() { return cached }
            throw error
        }
    }

    func adjustQuantity(of id: InventoryItem.ID, by delta: Int) async throws -> InventoryItem {
        let url = baseURL.appending(path: "v1/items/\\(id.uuidString)/adjust")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["delta": delta])
        let (data, response) = try await session.data(for: request)
        try Self.validate(response)
        return try JSONDecoder().decode(InventoryItem.self, from: data)
    }

    private func cachedItems() throws -> [InventoryItem] {
        let data = try Data(contentsOf: cacheURL)
        return try JSONDecoder().decode([InventoryItem].self, from: data)
    }

    private static func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw InventoryError.badStatus(http.statusCode)
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
        "Why identify items by `InventoryItem.ID` in the snapshot instead of the struct itself?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Because diffable data source diffs by **hash identity**. If you put the whole `InventoryItem` in the snapshot, a quantity change produces a different hash, so UIKit treats it as a delete plus an insert. You get a fade animation instead of an in-place update, and selection or swipe state on that cell is lost.\n\nUsing the stable `UUID` means the item keeps its identity across reloads. The trade-off is that content changes become invisible to the diff, which is why `apply` calls `reconfigureItems` for anything whose value changed. `reconfigureItems` (iOS 15+) reuses the existing cell and reruns the registration handler, which is cheaper than `reloadItems`.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Users report an error alert flashing when they pull to refresh twice quickly.",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "That's the cancellation path. `reload()` cancels the previous `loadTask`, and `URLSession.data(for:)` responds to task cancellation by throwing `URLError(.cancelled)`, not `CancellationError`. Your `catch is CancellationError` doesn't match, so the generic `catch` presents the alert.\n\nFix it in the view controller:\n```swift\n} catch {\n    if Task.isCancelled { return }\n    presentError(error)\n}\n```\nChecking `Task.isCancelled` covers both error types. Also note the `defer` ends refreshing on the cancelled task too, which can hide the spinner while the newer load is still running; only end it if `loadTask` is still the current task.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Is calling `apply` off the main thread a concern here?",
      delay: 48000,
    },
    {
      role: "assistant",
      content:
        "Not in this code. `UIViewController` is `@MainActor`, so the `Task` created in `reload()` inherits main-actor isolation. `store.fetchItems()` hops to the `InventoryStore` actor for the network work, then execution resumes on the main actor before `apply` runs.\n\nThe rule to keep in mind: always apply snapshots from the **same queue** consistently. Mixing main and background applies is what triggers the diffable data source assertion. Since everything here stays on the main actor, you're safe.\n\nIf the list grows to thousands of rows, move the filtering and sorting into the actor and return pre-split arrays, keeping only `dataSource.apply` on the main actor.",
      delay: 60000,
    },
  ],
};

export default config;
