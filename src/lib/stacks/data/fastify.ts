import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "fastify",
  project: "clinic-bookings",
  branch: "fix/double-booking-overlap",
  indent: "Spaces: 2",
  files: [
    "package.json",
    "src/app.ts",
    "src/plugins/auth.ts",
    "src/plugins/postgres.ts",
    "src/routes/bookings.ts",
    "src/repositories/booking-repo.ts",
    "migrations/004_bookings_exclusion.sql",
    "test/bookings.test.ts",
  ],
  snippets: [
    {
      filename: "src/routes/bookings.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { BookingRepository, SlotTakenError } from "../repositories/booking-repo.js";

const BookingParams = Type.Object({
  bookingId: Type.String({ format: "uuid" }),
});

const CreateBooking = Type.Object(
  {
    resourceId: Type.String({ format: "uuid" }),
    startsAt: Type.String({ format: "date-time" }),
    durationMinutes: Type.Integer({ minimum: 15, maximum: 240, multipleOf: 15 }),
    notes: Type.Optional(Type.String({ maxLength: 280 })),
  },
  { additionalProperties: false },
);

const Booking = Type.Object({
  id: Type.String(),
  resourceId: Type.String(),
  startsAt: Type.String({ format: "date-time" }),
  endsAt: Type.String({ format: "date-time" }),
  status: Type.Union([Type.Literal("confirmed"), Type.Literal("cancelled")]),
});

const bookingRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const repo = new BookingRepository(app.pg);

  // Every route in this plugin requires a valid session.
  app.addHook("onRequest", app.authenticate);

  app.post(
    "/bookings",
    {
      schema: { body: CreateBooking, response: { 201: Booking } },
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const startsAt = new Date(request.body.startsAt);
      if (startsAt.getTime() <= Date.now()) {
        throw app.httpErrors.badRequest("startsAt must be in the future");
      }

      try {
        const booking = await repo.create({
          resourceId: request.body.resourceId,
          durationMinutes: request.body.durationMinutes,
          notes: request.body.notes,
          startsAt,
          userId: request.user.sub,
        });
        return reply.code(201).send(booking);
      } catch (err) {
        if (err instanceof SlotTakenError) {
          throw app.httpErrors.conflict("That slot has just been booked");
        }
        throw err;
      }
    },
  );

  app.get(
    "/bookings/:bookingId",
    { schema: { params: BookingParams, response: { 200: Booking } } },
    async (request) => {
      const booking = await repo.findForUser(request.params.bookingId, request.user.sub);
      if (!booking) throw app.httpErrors.notFound();
      return booking;
    },
  );

  app.delete(
    "/bookings/:bookingId",
    { schema: { params: BookingParams } },
    async (request, reply) => {
      const cancelled = await repo.cancel(request.params.bookingId, request.user.sub);
      if (!cancelled) throw app.httpErrors.notFound();
      return reply.code(204).send();
    },
  );
};

export default bookingRoutes;`,
    },
    {
      filename: "src/repositories/booking-repo.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import type { PostgresDb } from "@fastify/postgres";

// Overlaps are rejected by the database, not by application code:
// EXCLUDE USING gist (resource_id WITH =, during WITH &&) WHERE (status = 'confirmed')
const EXCLUSION_VIOLATION = "23P01";

export class SlotTakenError extends Error {
  constructor() {
    super("slot already booked");
    this.name = "SlotTakenError";
  }
}

export interface Booking {
  id: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "cancelled";
}

export interface CreateBookingInput {
  resourceId: string;
  startsAt: Date;
  durationMinutes: number;
  notes?: string;
  userId: string;
}

const RETURNING =
  " RETURNING id, resource_id, lower(during) AS starts_at, upper(during) AS ends_at, status";

export class BookingRepository {
  constructor(private readonly db: PostgresDb) {}

  async create(input: CreateBookingInput): Promise<Booking> {
    const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
    try {
      const { rows } = await this.db.query(
        "INSERT INTO bookings (resource_id, user_id, during, notes, status)" +
          " VALUES ($1, $2, tstzrange($3, $4, '[)'), $5, 'confirmed')" +
          RETURNING,
        [input.resourceId, input.userId, input.startsAt, endsAt, input.notes ?? null],
      );
      return toBooking(rows[0]);
    } catch (err) {
      if (isPgError(err) && err.code === EXCLUSION_VIOLATION) throw new SlotTakenError();
      throw err;
    }
  }

  async findForUser(id: string, userId: string): Promise<Booking | null> {
    const { rows } = await this.db.query(
      "SELECT id, resource_id, lower(during) AS starts_at, upper(during) AS ends_at, status" +
        " FROM bookings WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    return rows[0] ? toBooking(rows[0]) : null;
  }

  async cancel(id: string, userId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      "UPDATE bookings SET status = 'cancelled', cancelled_at = now()" +
        " WHERE id = $1 AND user_id = $2 AND status = 'confirmed'",
      [id, userId],
    );
    return rowCount === 1;
  }
}

function isPgError(err: unknown): err is { code: string } {
  return typeof err === "object" && err !== null && "code" in err;
}

function toBooking(row: Record<string, any>): Booking {
  return {
    id: row.id,
    resourceId: row.resource_id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: row.status,
  };
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Why rely on an exclusion constraint instead of checking for overlapping bookings in `create()` first?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "A check-then-insert in application code has a race. Two requests for the same 10:00 slot can both run `SELECT ... WHERE during && $range`, both see nothing, and both insert. Under `READ COMMITTED`, neither transaction sees the other's uncommitted row.\n\nThe `EXCLUDE USING gist` constraint makes Postgres do the overlap check atomically at insert time. The losing insert fails with SQLSTATE `23P01`, which we map to `SlotTakenError` and a 409.\n\nTwo details matter:\n\n1. You need `CREATE EXTENSION btree_gist` so `resource_id WITH =` can share a GiST index with the range.\n2. The `WHERE (status = 'confirmed')` clause means cancelled bookings free the slot again.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Why `'[)'` for the range bounds?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Half-open ranges let back-to-back appointments sit next to each other. A 09:00–09:30 booking is `[09:00, 09:30)`, so it **excludes** 09:30, and a booking starting at 09:30 does not overlap it.\n\nWith `'[]'`, both ranges would include 09:30 and the constraint would reject the second booking. Clinic staff would see slots that look free but can't be booked.\n\n`[)` is also the default for `tstzrange(a, b)`. I wrote it explicitly so nobody has to remember that.",
      delay: 34000,
    },
    {
      role: "user",
      content:
        "Does the TypeBox `response` schema actually do anything at runtime, or is it just for types?",
      delay: 46000,
    },
    {
      role: "assistant",
      content:
        "Both. At runtime Fastify compiles the response schema with `fast-json-stringify`, which serialises faster than `JSON.stringify` and **drops any property not declared in the schema**. If `toBooking()` ever returned `userId` or `notes` by mistake, they wouldn't leak to the client.\n\nOne thing to watch: the 201 schema only covers that status. Errors thrown with `httpErrors.conflict()` go through Fastify's default error serialiser, which is fine. But if you `reply.code(200).send(...)` from the POST handler, there's no schema for 200, so the payload goes out unfiltered.\n\nAt type level, `FastifyPluginAsyncTypebox` types `request.body` and `request.params` from the schemas, so there's no need for manual casts.",
      delay: 57000,
    },
  ],
};

export default config;
