import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "flutter",
  project: "ledgerly-app",
  branch: "feat/offline-expenses",
  indent: "Spaces: 2",
  files: [
    "pubspec.yaml",
    "lib/main.dart",
    "lib/router.dart",
    "lib/widgets/states.dart",
    "lib/features/expenses/expense.dart",
    "lib/features/expenses/expense_list_screen.dart",
    "lib/features/expenses/expense_repository.dart",
    "test/features/expenses/expense_repository_test.dart",
  ],
  snippets: [
    {
      filename: "lib/features/expenses/expense_list_screen.dart",
      syntax: "clike",
      languageLabel: "Dart",
      code: `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../widgets/states.dart';
import 'expense.dart';
import 'expense_repository.dart';

final _currency = NumberFormat.simpleCurrency(locale: 'en_AU');
final _day = DateFormat('EEE d MMM', 'en_AU');
final _monthTitle = DateFormat.yMMMM('en_AU');

class ExpenseListScreen extends ConsumerWidget {
  const ExpenseListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final month = ref.watch(selectedMonthProvider);
    final expenses = ref.watch(expensesProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(_monthTitle.format(month)),
        actions: [
          IconButton(
            tooltip: 'Previous month',
            icon: const Icon(Icons.chevron_left),
            onPressed: () => ref.read(selectedMonthProvider.notifier).shift(-1),
          ),
          IconButton(
            tooltip: 'Next month',
            icon: const Icon(Icons.chevron_right),
            onPressed: () => ref.read(selectedMonthProvider.notifier).shift(1),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/expenses/new'),
        icon: const Icon(Icons.add),
        label: const Text('Add expense'),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(expensesProvider.notifier).refresh(),
        child: switch (expenses) {
          AsyncData(:final value) when value.isEmpty => const EmptyState(
              message: 'No expenses this month',
            ),
          AsyncData(:final value) => _ExpenseList(expenses: value),
          AsyncError(:final error) => ErrorState(
              message: error.toString(),
              onRetry: () => ref.invalidate(expensesProvider),
            ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _ExpenseList extends StatelessWidget {
  const _ExpenseList({required this.expenses});

  final List<Expense> expenses;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: expenses.length,
      itemExtent: 72,
      itemBuilder: (context, index) {
        final e = expenses[index];
        final amount = _currency.format(e.amountCents / 100);
        return MergeSemantics(
          child: ListTile(
            key: ValueKey(e.id),
            leading: CircleAvatar(
              child: Icon(e.category.icon, semanticLabel: e.category.label),
            ),
            title: Text(e.description, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text(_day.format(e.spentOn)),
            trailing: Text(amount, style: Theme.of(context).textTheme.titleMedium),
            onTap: () => context.push('/expenses/\${e.id}'),
          ),
        );
      },
    );
  }
}
`,
    },
    {
      filename: "lib/features/expenses/expense_repository.dart",
      syntax: "clike",
      languageLabel: "Dart",
      code: `import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'expense.dart';

// Supplied at build time: --dart-define=API_BASE_URL=...
const _baseUrl = String.fromEnvironment('API_BASE_URL');
const _cachePrefix = 'expenses.cache.v1';

String _monthKey(DateTime m) => '\${m.year}-\${m.month.toString().padLeft(2, '0')}';

final httpClientProvider = Provider<http.Client>((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return client;
});

final expenseRepositoryProvider = Provider<ExpenseRepository>((ref) {
  return ExpenseRepository(ref.watch(httpClientProvider));
});

class ExpenseRepository {
  ExpenseRepository(this._client);

  final http.Client _client;

  Future<List<Expense>> fetchMonth(DateTime month) async {
    final uri = Uri.parse('$_baseUrl/v1/expenses')
        .replace(queryParameters: {'month': _monthKey(month)});
    final response = await _client
        .get(uri, headers: {'Accept': 'application/json'})
        .timeout(const Duration(seconds: 10));
    if (response.statusCode != 200) {
      throw ExpenseException('Failed to load expenses (\${response.statusCode})');
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('$_cachePrefix.\${_monthKey(month)}', response.body);
    return _decode(response.body);
  }

  Future<List<Expense>?> cachedMonth(DateTime month) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_cachePrefix.\${_monthKey(month)}');
    return raw == null ? null : _decode(raw);
  }

  List<Expense> _decode(String body) => (jsonDecode(body) as List<dynamic>)
      .map((e) => Expense.fromJson(e as Map<String, dynamic>))
      .toList(growable: false);
}

class ExpenseException implements Exception {
  const ExpenseException(this.message);
  final String message;

  @override
  String toString() => message;
}

final selectedMonthProvider = NotifierProvider<SelectedMonth, DateTime>(SelectedMonth.new);

class SelectedMonth extends Notifier<DateTime> {
  @override
  DateTime build() {
    final now = DateTime.now();
    return DateTime(now.year, now.month);
  }

  void shift(int months) => state = DateTime(state.year, state.month + months);
}

final expensesProvider =
    AsyncNotifierProvider.autoDispose<ExpensesNotifier, List<Expense>>(ExpensesNotifier.new);

class ExpensesNotifier extends AsyncNotifier<List<Expense>> {
  @override
  Future<List<Expense>> build() async {
    final month = ref.watch(selectedMonthProvider);
    final repo = ref.watch(expenseRepositoryProvider);
    try {
      return await repo.fetchMonth(month);
    } on Exception {
      // Offline or server error: fall back to the last good copy for this month
      final cached = await repo.cachedMonth(month);
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Pull-to-refresh doesn't work when the month has no expenses. The spinner never appears.",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "That's because `RefreshIndicator` only triggers from a scroll notification, and `EmptyState` (and `ErrorState`) aren't scrollable. With a populated list you get `AlwaysScrollableScrollPhysics`, so the overscroll gesture works.\n\nWrap the non-list states so they can still be dragged:\n```dart\nListView(\n  physics: const AlwaysScrollableScrollPhysics(),\n  children: const [SizedBox(height: 120), EmptyState(message: 'No expenses this month')],\n)\n```\nOr use `CustomScrollView` with a `SliverFillRemaining(hasScrollBody: false)` so the empty state stays centred. The loading spinner case is fine because a refresh can't start there anyway.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Does `refresh()` show the old list while reloading, or flash the spinner?",
      delay: 25000,
    },
    {
      role: "assistant",
      content:
        "It keeps the old list. After `ref.invalidateSelf()`, Riverpod rebuilds the notifier and carries the previous value forward, so the state is still `AsyncData` with `isLoading` set to `true`. Your `switch` matches `AsyncData(:final value)` and keeps rendering the list, while `RefreshIndicator` shows its own spinner until `future` completes.\n\nTwo things to watch:\n1. Changing the month via `selectedMonthProvider` behaves the same way, so the previous month's list stays visible briefly. If that's confusing, check `expenses.isLoading` and dim the list.\n2. If the refresh fails and there's no cache, the state becomes `AsyncError` but still holds the previous value; your switch shows the error screen.",
      delay: 37000,
    },
    {
      role: "user",
      content: "How would you unit test the offline fallback in the notifier?",
      delay: 50000,
    },
    {
      role: "assistant",
      content:
        "Use a `ProviderContainer` with overrides so no real HTTP or storage is touched:\n1. Call `SharedPreferences.setMockInitialValues({...})` with a cached JSON body for the month key.\n2. Override `httpClientProvider` with `MockClient` from `package:http/testing.dart` that throws a `SocketException`.\n3. Read the provider and await it:\n```dart\nfinal container = ProviderContainer(overrides: [httpClientProvider.overrideWithValue(client)]);\naddTearDown(container.dispose);\nfinal result = await container.read(expensesProvider.future);\n```\nAssert you get the cached list. A second test with no cached value should expect the `SocketException` to propagate.\n\nBecause the provider is `autoDispose`, keep a `container.listen` subscription open so it isn't disposed mid-test.",
      delay: 62000,
    },
  ],
};

export default config;
