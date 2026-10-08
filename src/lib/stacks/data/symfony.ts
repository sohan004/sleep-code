import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "symfony",
  project: "ticketing-platform",
  branch: "fix/oversell-race-condition",
  indent: "Spaces: 4",
  files: [
    "config/packages/security.yaml",
    "src/Controller/Api/TicketOrderController.php",
    "src/Dto/CreateTicketOrderInput.php",
    "src/Entity/TicketOrder.php",
    "src/Entity/TicketTier.php",
    "src/Repository/TicketTierRepository.php",
    "src/Security/Voter/TicketOrderVoter.php",
    "src/Service/TicketReservationService.php",
    "tests/Service/TicketReservationServiceTest.php",
  ],
  snippets: [
    {
      filename: "src/Controller/Api/TicketOrderController.php",
      syntax: "clike",
      languageLabel: "PHP",
      code: `<?php

declare(strict_types=1);

namespace App\\Controller\\Api;

use App\\Dto\\CreateTicketOrderInput;
use App\\Entity\\Event;
use App\\Entity\\TicketOrder;
use App\\Entity\\User;
use App\\Service\\TicketReservationService;
use Symfony\\Bridge\\Doctrine\\Attribute\\MapEntity;
use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpFoundation\\JsonResponse;
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\HttpKernel\\Attribute\\MapRequestPayload;
use Symfony\\Component\\Routing\\Attribute\\Route;
use Symfony\\Component\\Security\\Http\\Attribute\\CurrentUser;
use Symfony\\Component\\Security\\Http\\Attribute\\IsGranted;

#[Route('/api/events/{id}/orders', name: 'api_event_orders_')]
final class TicketOrderController extends AbstractController
{
    public function __construct(
        private readonly TicketReservationService $reservations,
    ) {
    }

    #[Route('', name: 'create', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function create(
        Event $event,
        #[MapRequestPayload] CreateTicketOrderInput $input,
        #[CurrentUser] User $user,
    ): JsonResponse {
        if (!$event->isOnSale()) {
            return $this->json(
                ['error' => 'Tickets for this event are not on sale.'],
                Response::HTTP_CONFLICT,
            );
        }

        $order = $this->reservations->reserve($event, $user, $input->tierId, $input->quantity);

        return $this->json($order, Response::HTTP_CREATED, [], ['groups' => ['order:read']]);
    }

    #[Route('/{orderId}', name: 'show', methods: ['GET'])]
    public function show(
        #[MapEntity(id: 'orderId')] TicketOrder $order,
    ): JsonResponse {
        // The voter checks ownership, so guessing another order ID returns 403
        $this->denyAccessUnlessGranted('ORDER_VIEW', $order);

        return $this->json($order, context: ['groups' => ['order:read']]);
    }

    #[Route('/{orderId}/cancel', name: 'cancel', methods: ['POST'])]
    public function cancel(
        #[MapEntity(id: 'orderId')] TicketOrder $order,
    ): JsonResponse {
        $this->denyAccessUnlessGranted('ORDER_CANCEL', $order);

        try {
            $this->reservations->release($order);
        } catch (\\LogicException $e) {
            return $this->json(
                ['error' => $e->getMessage()],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}
`,
    },
    {
      filename: "src/Service/TicketReservationService.php",
      syntax: "clike",
      languageLabel: "PHP",
      code: `<?php

declare(strict_types=1);

namespace App\\Service;

use App\\Entity\\Event;
use App\\Entity\\TicketOrder;
use App\\Entity\\User;
use App\\Enum\\OrderStatus;
use App\\Exception\\SoldOutException;
use App\\Repository\\TicketOrderRepository;
use App\\Repository\\TicketTierRepository;
use Doctrine\\DBAL\\LockMode;
use Doctrine\\ORM\\EntityManagerInterface;
use Psr\\Log\\LoggerInterface;
use Symfony\\Component\\Clock\\ClockInterface;

final class TicketReservationService
{
    private const HOLD_MINUTES = 15;
    private const MAX_PER_ORDER = 10;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly TicketTierRepository $tiers,
        private readonly TicketOrderRepository $orders,
        private readonly ClockInterface $clock,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function reserve(Event $event, User $user, int $tierId, int $quantity): TicketOrder
    {
        if ($quantity < 1 || $quantity > self::MAX_PER_ORDER) {
            throw new \\InvalidArgumentException('Quantity must be between 1 and 10.');
        }

        return $this->em->wrapInTransaction(function () use ($event, $user, $tierId, $quantity) {
            // Pessimistic write lock: concurrent buyers queue on this row instead of overselling
            $tier = $this->tiers->find($tierId, LockMode::PESSIMISTIC_WRITE);

            if ($tier === null || $tier->getEvent() !== $event) {
                throw new \\InvalidArgumentException('Unknown ticket tier for this event.');
            }

            if ($tier->getRemaining() < $quantity) {
                throw new SoldOutException($tier, $quantity);
            }

            $tier->decrementRemaining($quantity);

            $order = new TicketOrder(
                event: $event,
                tier: $tier,
                buyer: $user,
                quantity: $quantity,
                unitPriceCents: $tier->getPriceCents(),
                expiresAt: $this->clock->now()->modify(sprintf('+%d minutes', self::HOLD_MINUTES)),
            );

            $this->em->persist($order);

            $this->logger->info('Tickets held', [
                'order' => $order->getReference(),
                'tier' => $tier->getId(),
                'quantity' => $quantity,
            ]);

            return $order;
        });
    }

    public function release(TicketOrder $order): void
    {
        if ($order->getStatus() !== OrderStatus::Pending) {
            throw new \\LogicException('Only pending orders can be cancelled.');
        }

        $this->em->wrapInTransaction(function () use ($order): void {
            $tier = $this->tiers->find($order->getTier()->getId(), LockMode::PESSIMISTIC_WRITE);
            $tier->incrementRemaining($order->getQuantity());
            $order->markCancelled($this->clock->now());
        });
    }

    public function expireStaleHolds(): int
    {
        $stale = $this->orders->findExpiredPending($this->clock->now());

        foreach ($stale as $order) {
            $this->release($order);
        }

        return \\count($stale);
    }
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "We oversold a tier last weekend. I've added the `PESSIMISTIC_WRITE` lock in `reserve()`. Is that enough on its own?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "For `reserve()`, yes. `find($tierId, LockMode::PESSIMISTIC_WRITE)` issues `SELECT ... FOR UPDATE` inside `wrapInTransaction()`, so a second buyer blocks until the first commits and then reads the decremented `remaining`. Two things to check:\n\n1. **Lock order.** If you ever lock the event row as well as the tier, always lock them in the same order or you'll get deadlocks under load.\n2. **Identity map.** If the tier was already loaded earlier in the request, Doctrine still sends the locking query but keeps the managed entity's existing values. Here it's only fetched inside the transaction, so you're fine.\n\nThe bigger gap is actually in `release()`.",
      delay: 12000,
    },
    {
      role: "user",
      content: "What's wrong with `release()`? It locks the tier too.",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "The status check runs **before** the transaction and against the order, not the tier. If the cancel endpoint and the `expireStaleHolds()` cron hit the same order at the same moment, both see `Pending`, both enter the transaction, and the tier gets incremented twice. That gives you phantom stock, which is the same oversell bug in reverse.\n\nMove the check inside and lock the order itself:\n\n```php\n$this->em->lock($order, LockMode::PESSIMISTIC_WRITE);\n$this->em->refresh($order);\nif ($order->getStatus() !== OrderStatus::Pending) {\n    throw new \\LogicException('Already released.');\n}\n```\n\nThe `refresh()` matters because the entity in memory may be stale.",
      delay: 35000,
    },
    {
      role: "user",
      content:
        "And `expireStaleHolds()` opens one transaction per order. Should I batch it?",
      delay: 49000,
    },
    {
      role: "assistant",
      content:
        "Keeping one transaction per order is reasonable here. Short transactions hold tier locks briefly, so checkout isn't stalled while the sweep runs. What I'd change:\n\n1. **Memory.** `findExpiredPending()` hydrates everything. Cap it with `setMaxResults(500)` and call `$this->em->clear()` between batches.\n2. **Scheduling.** Run it from a Symfony Scheduler `RecurringMessage::every('1 minute', ...)` handled by Messenger, rather than system cron, so retries and failure transport come for free.\n3. **Tests.** In `TicketReservationServiceTest`, inject a `MockClock` and call `$clock->sleep(16 * 60)` to cross the hold boundary deterministically, then assert `remaining` is restored exactly once even when `release()` is called twice.",
      delay: 61000,
    },
  ],
};

export default config;
