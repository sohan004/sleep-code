import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "laravel",
  project: "invoicing-api",
  branch: "feat/invoice-reminders",
  indent: "Spaces: 4",
  files: [
    "app/Enums/ReminderChannel.php",
    "app/Http/Controllers/InvoiceController.php",
    "app/Http/Requests/StoreInvoiceRequest.php",
    "app/Models/Invoice.php",
    "app/Models/InvoiceReminder.php",
    "app/Policies/InvoicePolicy.php",
    "app/Services/InvoiceReminderService.php",
    "routes/api.php",
    "tests/Feature/InvoiceReminderTest.php",
  ],
  snippets: [
    {
      filename: "app/Http/Controllers/InvoiceController.php",
      syntax: "clike",
      languageLabel: "PHP",
      code: `<?php

declare(strict_types=1);

namespace App\\Http\\Controllers;

use App\\Enums\\ReminderChannel;
use App\\Http\\Requests\\StoreInvoiceRequest;
use App\\Http\\Resources\\InvoiceResource;
use App\\Models\\Invoice;
use App\\Services\\InvoiceReminderService;
use Illuminate\\Http\\JsonResponse;
use Illuminate\\Http\\Request;
use Illuminate\\Http\\Resources\\Json\\AnonymousResourceCollection;
use Illuminate\\Support\\Facades\\Gate;

class InvoiceController extends Controller
{
    public function __construct(
        private readonly InvoiceReminderService $reminders,
    ) {
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Invoice::class);

        $invoices = Invoice::query()
            ->with(['customer:id,name,email', 'lineItems'])
            ->withSum('payments', 'amount')
            ->where('team_id', $request->user()->current_team_id)
            ->when($request->string('status')->value(), function ($query, string $status) {
                $query->where('status', $status);
            })
            ->latest('issued_at')
            ->paginate(min($request->integer('per_page', 25), 100));

        return InvoiceResource::collection($invoices);
    }

    public function store(StoreInvoiceRequest $request): JsonResponse
    {
        // Authorisation and validation both live in StoreInvoiceRequest
        $invoice = $request->user()->currentTeam->invoices()->create(
            $request->safe()->except('line_items')
        );

        $invoice->lineItems()->createMany($request->validated('line_items'));
        $invoice->refresh()->recalculateTotals();

        return InvoiceResource::make($invoice->load('lineItems'))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Invoice $invoice): InvoiceResource
    {
        Gate::authorize('view', $invoice);

        return InvoiceResource::make(
            $invoice->load(['customer', 'lineItems', 'payments', 'reminders'])
        );
    }

    public function sendReminder(Request $request, Invoice $invoice): JsonResponse
    {
        Gate::authorize('remind', $invoice);

        $validated = $request->validate([
            'channel' => ['required', 'in:email,sms'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $reminder = $this->reminders->send(
            $invoice,
            ReminderChannel::from($validated['channel']),
            $validated['note'] ?? null,
        );

        return response()->json([
            'id' => $reminder->id,
            'sent_at' => $reminder->sent_at?->toIso8601String(),
            'next_eligible_at' => $this->reminders->nextEligibleAt($invoice)->toIso8601String(),
        ]);
    }
}
`,
    },
    {
      filename: "app/Services/InvoiceReminderService.php",
      syntax: "clike",
      languageLabel: "PHP",
      code: `<?php

declare(strict_types=1);

namespace App\\Services;

use App\\Enums\\InvoiceStatus;
use App\\Enums\\ReminderChannel;
use App\\Exceptions\\ReminderThrottledException;
use App\\Models\\Invoice;
use App\\Models\\InvoiceReminder;
use App\\Notifications\\InvoiceOverdueNotification;
use Carbon\\CarbonImmutable;
use DomainException;
use Illuminate\\Support\\Facades\\DB;

final class InvoiceReminderService
{
    private const MIN_HOURS_BETWEEN_REMINDERS = 72;

    public function __construct(
        private readonly int $maxRemindersPerInvoice = 5,
    ) {
    }

    public function send(
        Invoice $invoice,
        ReminderChannel $channel,
        ?string $note = null,
    ): InvoiceReminder {
        if ($invoice->status !== InvoiceStatus::Overdue) {
            throw new DomainException('Only overdue invoices can receive reminders.');
        }

        return DB::transaction(function () use ($invoice, $channel, $note): InvoiceReminder {
            // Lock the row so two concurrent requests cannot both pass the throttle check
            $locked = Invoice::query()->lockForUpdate()->findOrFail($invoice->id);

            if ($locked->reminders()->count() >= $this->maxRemindersPerInvoice) {
                throw ReminderThrottledException::limitReached($locked);
            }

            $eligibleAt = $this->nextEligibleAt($locked);

            if (CarbonImmutable::now()->lt($eligibleAt)) {
                throw ReminderThrottledException::tooSoon($eligibleAt);
            }

            $reminder = $locked->reminders()->create([
                'channel' => $channel,
                'note' => $note,
                'sent_at' => now(),
            ]);

            $locked->customer->notify(
                (new InvoiceOverdueNotification($locked, $channel, $note))->afterCommit()
            );

            return $reminder;
        });
    }

    public function nextEligibleAt(Invoice $invoice): CarbonImmutable
    {
        $lastSentAt = $invoice->reminders()->max('sent_at');

        if ($lastSentAt === null) {
            return CarbonImmutable::now();
        }

        return CarbonImmutable::parse($lastSentAt)->addHours(self::MIN_HOURS_BETWEEN_REMINDERS);
    }

    public function remindAllOverdue(int $teamId, ReminderChannel $channel): int
    {
        $sent = 0;

        Invoice::query()
            ->where('team_id', $teamId)
            ->where('status', InvoiceStatus::Overdue)
            ->where('due_at', '<', now()->subDays(7))
            ->with('customer')
            ->chunkById(200, function ($invoices) use ($channel, &$sent): void {
                foreach ($invoices as $invoice) {
                    try {
                        $this->send($invoice, $channel);
                        $sent++;
                    } catch (ReminderThrottledException) {
                        continue;
                    }
                }
            });

        return $sent;
    }
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "The invoice index is getting slow for teams with a few thousand invoices. Anything obvious in `InvoiceController::index`?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "The eager loading is already in good shape: `with(['customer:id,name,email', 'lineItems'])` avoids the classic N+1, and `withSum('payments', 'amount')` adds a correlated subquery instead of loading every payment.\n\nThe likely culprits are elsewhere:\n1. **Missing composite index.** The query filters on `team_id` and `status`, then sorts by `issued_at`. Add `$table->index(['team_id', 'status', 'issued_at'])` so MySQL can filter and sort from the index.\n2. **`paginate()` runs a `COUNT(*)`** on every request. If the UI only needs next/previous, `cursorPaginate()` skips the count and stays fast on deep pages.\n3. **`lineItems` on a list view** may be more than you need. If the resource only shows a total, store it on the invoice.",
      delay: 11000,
    },
    {
      role: "user",
      content:
        "Good call on the index. What about `remindAllOverdue`? It runs nightly for every team.",
      delay: 23000,
    },
    {
      role: "assistant",
      content:
        "That one has a hidden N+1. `chunkById` keeps memory flat, but each `send()` call then:\n1. Opens a transaction and re-reads the invoice with `lockForUpdate()`\n2. Runs `reminders()->count()`\n3. Runs `reminders()->max('sent_at')`\n\nThat is three queries plus a transaction per invoice, so 2,000 overdue invoices means about 6,000 round trips. You can pre-filter in SQL so throttled invoices never reach `send()`:\n\n```php\n->withCount('reminders')\n->withMax('reminders', 'sent_at')\n->having('reminders_count', '<', 5)\n```\n\nKeep the checks inside `send()` as well, because the lock is what makes them reliable under concurrency. The pre-filter only cuts down the wasted work.",
      delay: 34000,
    },
    {
      role: "user",
      content:
        "Why `afterCommit()` on the notification? The transaction is tiny.",
      delay: 47000,
    },
    {
      role: "assistant",
      content:
        "Size doesn't matter here, timing does. `InvoiceOverdueNotification` is queued, so without `afterCommit()` the job can be dispatched before the transaction commits. A fast worker might then:\n\n- send the email, and then the transaction rolls back (for example a deadlock on the lock), so the customer gets a reminder with no `InvoiceReminder` row behind it, or\n- load the reminder by ID before it's visible and fail with `ModelNotFoundException`.\n\n`afterCommit()` holds the dispatch until the outer transaction commits and drops it if the transaction rolls back. For tests, `Notification::fake()` plus `Notification::assertSentTo($customer, InvoiceOverdueNotification::class)` covers the happy path. Add a second test that throws inside the transaction and asserts `assertNothingSent()`.",
      delay: 58000,
    },
  ],
};

export default config;
