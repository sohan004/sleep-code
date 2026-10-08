import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "express",
  project: "orders-api",
  branch: "feat/order-refunds",
  indent: "Spaces: 2",
  files: [
    "package.json",
    "tsconfig.json",
    "src/app.ts",
    "src/db/pool.ts",
    "src/middleware/auth.ts",
    "src/middleware/rate-limit.ts",
    "src/routes/refunds.ts",
    "src/services/refund-service.ts",
    "test/refunds.test.ts",
  ],
  snippets: [
    {
      filename: "src/routes/refunds.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { RefundError, RefundService } from "../services/refund-service.js";
import { pool } from "../db/pool.js";

const router = Router();
const refunds = new RefundService(pool);

const orderParams = z.object({ orderId: z.string().uuid() });

const createRefundSchema = z.object({
  amountCents: z.number().int().positive().max(10_000_000),
  reason: z.enum(["damaged", "not_received", "duplicate", "other"]),
  note: z.string().trim().max(500).optional(),
});

// Express 5 forwards rejected promises to the error handler, so no async wrapper.
router.post(
  "/orders/:orderId/refunds",
  requireAuth,
  requireRole("support", "admin"),
  rateLimit({ windowMs: 60_000, max: 20 }),
  async (req: Request, res: Response) => {
    const { orderId } = orderParams.parse(req.params);
    const body = createRefundSchema.parse(req.body);

    const idempotencyKey = req.get("Idempotency-Key");
    if (!idempotencyKey || idempotencyKey.length > 128) {
      res.status(400).json({ error: "Idempotency-Key header is required" });
      return;
    }

    const refund = await refunds.create({
      orderId,
      amountCents: body.amountCents,
      reason: body.reason,
      note: body.note,
      requestedBy: req.user!.id,
      idempotencyKey,
    });

    res.status(201).location("/orders/" + orderId + "/refunds/" + refund.id).json(refund);
  },
);

router.get("/orders/:orderId/refunds", requireAuth, async (req: Request, res: Response) => {
  const { orderId } = orderParams.parse(req.params);

  // Return 404 rather than 403 so order IDs can't be probed.
  const canView = await refunds.canViewOrder(orderId, req.user!);
  if (!canView) {
    res.status(404).json({ error: "order not found" });
    return;
  }

  const items = await refunds.listForOrder(orderId);
  res.json({ items });
});

router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof z.ZodError) {
    res.status(422).json({ error: "validation failed", issues: err.issues });
    return;
  }
  if (err instanceof RefundError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  next(err);
});

export default router;`,
    },
    {
      filename: "src/services/refund-service.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import type { Pool, PoolClient } from "pg";

export type RefundReason = "damaged" | "not_received" | "duplicate" | "other";

export interface Refund {
  id: string;
  orderId: string;
  amountCents: number;
  reason: RefundReason;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
}

export type CreateRefundInput = Pick<Refund, "orderId" | "amountCents" | "reason"> & {
  note?: string;
  requestedBy: string;
  idempotencyKey: string;
};

export type Actor = { id: string; role: "customer" | "support" | "admin" };

export class RefundError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "RefundError";
  }
}

const UNIQUE_VIOLATION = "23505";
const SELECT_REFUND =
  'SELECT id, order_id AS "orderId", amount_cents AS "amountCents", reason, status,' +
  ' created_at AS "createdAt" FROM refunds';

export class RefundService {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateRefundInput): Promise<Refund> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Lock the order row so concurrent refunds are serialised per order.
      const order = await client.query(
        "SELECT total_cents FROM orders WHERE id = $1 FOR UPDATE",
        [input.orderId],
      );
      if (!order.rows[0]) throw new RefundError("order not found", 404, "ORDER_NOT_FOUND");

      const refunded = await this.refundedTotal(client, input.orderId);
      if (input.amountCents > order.rows[0].total_cents - refunded) {
        throw new RefundError("amount exceeds refundable balance", 409, "OVER_REFUND");
      }

      const inserted = await client.query<{ id: string }>(
        "INSERT INTO refunds (order_id, amount_cents, reason, note, requested_by," +
          " idempotency_key) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        [input.orderId, input.amountCents, input.reason, input.note ?? null,
          input.requestedBy, input.idempotencyKey],
      );
      const { rows } = await client.query<Refund>(SELECT_REFUND + " WHERE id = $1",
        [inserted.rows[0].id]);
      await client.query("COMMIT");
      return rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
      // Lost an idempotency race: return the refund the other request created.
      const { rows } = await this.pool.query<Refund>(SELECT_REFUND + " WHERE idempotency_key = $1",
        [input.idempotencyKey]);
      return rows[0];
    } finally {
      client.release();
    }
  }

  async listForOrder(orderId: string): Promise<Refund[]> {
    const { rows } = await this.pool.query<Refund>(
      SELECT_REFUND + " WHERE order_id = $1 ORDER BY created_at DESC",
      [orderId],
    );
    return rows;
  }

  async canViewOrder(orderId: string, actor: Actor): Promise<boolean> {
    if (actor.role !== "customer") return true;
    const { rowCount } = await this.pool.query(
      "SELECT 1 FROM orders WHERE id = $1 AND customer_id = $2",
      [orderId, actor.id],
    );
    return rowCount === 1;
  }

  private async refundedTotal(client: PoolClient, orderId: string): Promise<number> {
    const { rows } = await client.query(
      "SELECT COALESCE(SUM(amount_cents), 0)::int AS total FROM refunds" +
        " WHERE order_id = $1 AND status <> 'rejected'",
      [orderId],
    );
    return rows[0].total;
  }
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Two support agents double-clicked the refund button and we got two rows with the same Idempotency-Key in staging. How did that happen?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "The old version checked for an existing key with a `SELECT` before inserting. Two transactions can both run that check, both find nothing, and both insert. That is a classic check-then-act race.\n\nThe fix is to make the database enforce it:\n\n```sql\nCREATE UNIQUE INDEX refunds_idempotency_key_uq\n  ON refunds (idempotency_key);\n```\n\n`create()` now catches Postgres error `23505` (unique violation), rolls back, and returns the refund that won the race. Both clicks get the same response, which is the behaviour you want from an idempotent endpoint. The `FOR UPDATE` on the order row also serialises refunds for the same order, so the balance check can't be bypassed either.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Why is there no `asyncHandler` wrapper around the routes any more?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Express 5 handles it natively. If a route handler or middleware returns a rejected promise, Express calls `next(err)` for you, so the router-level error handler receives `ZodError` and `RefundError` directly.\n\nTwo things to watch:\n\n1. Don't call `res.json()` and then also throw. Once headers are sent, the default handler can only close the socket.\n2. The handler in `refunds.ts` must keep **four** parameters. Express identifies error middleware by `fn.length === 4`, so removing `next` would silently turn it into normal middleware.",
      delay: 35000,
    },
    {
      role: "user",
      content: "`refundedTotal` casts the SUM to `::int`. Is that safe?",
      delay: 47000,
    },
    {
      role: "assistant",
      content:
        "It's a deliberate trade-off. `SUM()` over an `integer` column returns `bigint`, and `node-postgres` returns `bigint` as a **string** by default to avoid losing precision. Without the cast, `total_cents - \"1500\"` happens to work through coercion, but `+` would concatenate strings, which is a nasty bug waiting to happen.\n\n`::int` overflows at about 2.1 billion cents (about AUD 21 million) per order, which is far beyond your `max(10_000_000)` per refund. If that limit ever worries you, use `::bigint` and register a parser with `pg.types.setTypeParser(20, BigInt)`, then do the maths with `bigint` throughout.",
      delay: 58000,
    },
    {
      role: "user",
      content: "Can you sketch a supertest case for the over-refund path?",
      delay: 70000,
    },
    {
      role: "assistant",
      content:
        "Seed an order with `total_cents = 5000` and an approved refund of 4000, then:\n\n```ts\nconst res = await request(app)\n  .post('/orders/' + orderId + '/refunds')\n  .set('Authorization', 'Bearer ' + supportToken)\n  .set('Idempotency-Key', randomUUID())\n  .send({ amountCents: 1500, reason: 'damaged' });\n\nexpect(res.status).toBe(409);\nexpect(res.body.code).toBe('OVER_REFUND');\n```\n\nAlso add a test that sends 1000 to confirm the boundary is inclusive, and one with a `rejected` refund to confirm those rows are ignored.",
      delay: 81000,
    },
  ],
};

export default config;
