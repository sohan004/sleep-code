import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "socketio",
  project: "helpdesk-realtime",
  branch: "feat/ticket-live-chat",
  indent: "Spaces: 2",
  files: [
    "package.json",
    "src/index.ts",
    "src/socket/server.ts",
    "src/socket/ticket-handlers.ts",
    "src/socket/types.ts",
    "src/tickets/ticket-store.ts",
    "src/auth/tokens.ts",
    "test/ticket-handlers.test.ts",
  ],
  snippets: [
    {
      filename: "src/socket/server.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { createServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { verifyAccessToken } from "../auth/tokens.js";
import { registerTicketHandlers } from "./ticket-handlers.js";
import { logger } from "../logger.js";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types.js";

const allowedOrigins = (process.env.CORS_ORIGINS ?? "").split(",").filter(Boolean);

export type HelpdeskServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export async function createSocketServer(port: number) {
  const httpServer = createServer();
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);

  const io: HelpdeskServer = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
    adapter: createAdapter(pubClient, subClient),
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 20_000,
    pingTimeout: 10_000,
  });

  // Reject the handshake before any event handler is registered.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || token.length > 4096) {
      return next(new Error("unauthorised"));
    }
    try {
      const claims = await verifyAccessToken(token);
      socket.data.userId = claims.sub;
      socket.data.orgId = claims.orgId;
      socket.data.role = claims.role;
      next();
    } catch {
      next(new Error("unauthorised"));
    }
  });

  io.on("connection", (socket) => {
    socket.join("org:" + socket.data.orgId);
    if (socket.data.role === "agent") {
      socket.join("agents:" + socket.data.orgId);
    }
    registerTicketHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      logger.debug({ userId: socket.data.userId, reason }, "socket disconnected");
    });
  });

  httpServer.listen(port);
  logger.info({ port }, "helpdesk realtime listening");

  return {
    io,
    async close() {
      await io.close();
      await Promise.all([pubClient.quit(), subClient.quit()]);
    },
  };
}`,
    },
    {
      filename: "src/socket/ticket-handlers.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import type { Socket } from "socket.io";
import { z } from "zod";
import { TicketStore } from "../tickets/ticket-store.js";
import { logger } from "../logger.js";
import type { HelpdeskServer } from "./server.js";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types.js";

type HelpdeskSocket = Socket<
  ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData
>;
type Ack = (response: { ok: boolean; error?: string; [key: string]: unknown }) => void;

const store = new TicketStore();

const JoinSchema = z.object({ ticketId: z.string().uuid() });
const MessageSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  clientMsgId: z.string().min(8).max(64),
});
const TypingSchema = z.object({ ticketId: z.string().uuid(), typing: z.boolean() });

const room = (ticketId: string) => "ticket:" + ticketId;

// Wraps async handlers so a thrown error becomes a failed ack instead of an unhandled rejection.
function safe(handler: (payload: unknown, ack: Ack) => Promise<void>) {
  return (payload: unknown, ack?: Ack) => {
    const reply: Ack = typeof ack === "function" ? ack : () => {};
    handler(payload, reply).catch((err) => {
      logger.error({ err }, "ticket handler failed");
      reply({ ok: false, error: "internal error" });
    });
  };
}

export function registerTicketHandlers(io: HelpdeskServer, socket: HelpdeskSocket) {
  socket.on("ticket:join", safe(async (payload, ack) => {
    const parsed = JoinSchema.safeParse(payload);
    if (!parsed.success) return ack({ ok: false, error: "invalid payload" });

    const ticket = await store.findForUser(parsed.data.ticketId, socket.data);
    if (!ticket) return ack({ ok: false, error: "not found" });

    await socket.join(room(ticket.id));
    const history = await store.recentMessages(ticket.id, 50);
    ack({ ok: true, ticket, history });
  }));

  socket.on("ticket:message", safe(async (payload, ack) => {
    const parsed = MessageSchema.safeParse(payload);
    if (!parsed.success) return ack({ ok: false, error: "invalid payload" });
    const { ticketId, body, clientMsgId } = parsed.data;

    if (!socket.rooms.has(room(ticketId))) {
      return ack({ ok: false, error: "join the ticket first" });
    }

    // appendMessage upserts on (ticket_id, client_msg_id), so retries are idempotent.
    const message = await store.appendMessage({
      ticketId,
      authorId: socket.data.userId,
      body,
      clientMsgId,
    });
    socket.to(room(ticketId)).emit("ticket:message", message);
    ack({ ok: true, message });

    if (socket.data.role !== "agent") {
      io.to("agents:" + socket.data.orgId).emit("ticket:activity", {
        ticketId,
        at: message.createdAt,
      });
    }
  }));

  socket.on("ticket:typing", (payload: unknown) => {
    const parsed = TypingSchema.safeParse(payload);
    if (!parsed.success || !socket.rooms.has(room(parsed.data.ticketId))) return;
    socket.volatile.to(room(parsed.data.ticketId)).emit("ticket:typing", {
      ticketId: parsed.data.ticketId,
      userId: socket.data.userId,
      typing: parsed.data.typing,
    });
  });

  socket.on("ticket:leave", (payload: unknown) => {
    const parsed = JoinSchema.safeParse(payload);
    if (parsed.success) socket.leave(room(parsed.data.ticketId));
  });
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Reconnects after a brief Wi-Fi drop are losing messages, even though `connectionStateRecovery` is turned on. Any idea why?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "The adapter is the cause. Connection state recovery needs an adapter that can **store and replay** packets. The in-memory adapter can, and so can `@socket.io/redis-streams-adapter` and the Postgres and Mongo adapters. The classic `@socket.io/redis-adapter` is plain pub/sub, so it has nothing to replay. On reconnect, `socket.recovered` is always `false` and the client gets a fresh session.\n\nOptions:\n\n1. Switch to the Redis Streams adapter: `createAdapter(redisClient)` from `@socket.io/redis-streams-adapter`, using a single client.\n2. Or keep pub/sub and have the client request `recentMessages` since its last seen message ID after `connect`.\n\nOption 1 is less code. Option 2 also covers disconnections longer than `maxDisconnectionDuration`.",
      delay: 13000,
    },
    {
      role: "user",
      content: "Why does `ticket:message` need a `clientMsgId`?",
      delay: 26000,
    },
    {
      role: "assistant",
      content:
        "Acks aren't guaranteed. If the connection drops after the server saves the message but before the ack reaches the client, the client can't tell whether the send succeeded, so it retries. Without a client-generated ID, that retry creates a duplicate.\n\nWith `clientMsgId` and a unique index on `(ticket_id, client_msg_id)`, `appendMessage` uses `INSERT ... ON CONFLICT DO NOTHING RETURNING` and falls back to a select, so the retry gets the original message back. The client should create the ID once per message (`crypto.randomUUID()`) and reuse it on retries, rather than per attempt.",
      delay: 37000,
    },
    {
      role: "user",
      content: "Is `socket.volatile` right for typing indicators?",
      delay: 49000,
    },
    {
      role: "assistant",
      content:
        "Yes. A volatile emit is dropped if the underlying transport isn't ready to write, instead of being buffered. For typing indicators that's what you want: a stale \"is typing...\" delivered 5 seconds late is worse than none.\n\nTwo improvements:\n\n1. Throttle on the client, emitting `typing: true` at most every 2–3 seconds rather than on each keypress.\n2. Clear the indicator after a timeout on the receiving side, because a volatile `typing: false` may never arrive.\n\nYou could also add a per-socket limit, for example a token bucket in `socket.data`, so a misbehaving client can't flood a ticket room.",
      delay: 60000,
    },
  ],
};

export default config;
