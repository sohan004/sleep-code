import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "nestjs",
  project: "warehouse-service",
  branch: "feat/stock-reservations",
  indent: "Spaces: 2",
  files: [
    "nest-cli.json",
    "package.json",
    "src/main.ts",
    "src/app.module.ts",
    "src/inventory/inventory.module.ts",
    "src/inventory/inventory.controller.ts",
    "src/inventory/inventory.service.ts",
    "src/inventory/dto/reserve-stock.dto.ts",
    "src/inventory/entities/stock-item.entity.ts",
    "src/inventory/inventory.service.spec.ts",
  ],
  snippets: [
    {
      filename: "src/inventory/inventory.controller.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { InventoryService } from "./inventory.service";
import { ReserveStockDto } from "./dto/reserve-stock.dto";
import { ListStockQueryDto } from "./dto/list-stock-query.dto";

// ValidationPipe is global (whitelist + forbidNonWhitelisted), see main.ts.
@Controller("warehouses/:warehouseId/stock")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Roles("viewer", "operator", "admin")
  list(
    @Param("warehouseId", new ParseUUIDPipe()) warehouseId: string,
    @Query() query: ListStockQueryDto,
  ) {
    return this.inventory.list(warehouseId, query);
  }

  @Get(":sku")
  @Roles("viewer", "operator", "admin")
  findOne(
    @Param("warehouseId", new ParseUUIDPipe()) warehouseId: string,
    @Param("sku") sku: string,
  ) {
    return this.inventory.findBySku(warehouseId, sku);
  }

  @Post("reservations")
  @HttpCode(HttpStatus.CREATED)
  @Roles("operator", "admin")
  reserve(
    @Param("warehouseId", new ParseUUIDPipe()) warehouseId: string,
    @Body() dto: ReserveStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventory.reserve(warehouseId, dto, user.id);
  }

  @Post("reservations/:reservationId/release")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles("operator", "admin")
  async release(
    @Param("warehouseId", new ParseUUIDPipe()) warehouseId: string,
    @Param("reservationId", new ParseUUIDPipe()) reservationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.inventory.release(warehouseId, reservationId, user.id);
  }
}`,
    },
    {
      filename: "src/inventory/inventory.service.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DataSource, IsNull, LessThan, Repository } from "typeorm";
import { StockItem } from "./entities/stock-item.entity";
import { Reservation } from "./entities/reservation.entity";
import { ReserveStockDto } from "./dto/reserve-stock.dto";
import { ListStockQueryDto } from "./dto/list-stock-query.dto";

const DEFAULT_PAGE_SIZE = 50;
const RESERVATION_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(StockItem) private readonly stock: Repository<StockItem>,
    @InjectRepository(Reservation) private readonly reservations: Repository<Reservation>,
    private readonly dataSource: DataSource,
  ) {}

  list(warehouseId: string, query: ListStockQueryDto) {
    return this.stock.find({
      where: { warehouseId },
      order: { sku: "ASC" },
      take: Math.min(query.limit ?? DEFAULT_PAGE_SIZE, 200),
      skip: query.offset ?? 0,
    });
  }

  async findBySku(warehouseId: string, sku: string) {
    const item = await this.stock.findOneBy({ warehouseId, sku });
    if (!item) throw new NotFoundException("SKU " + sku + " is not stocked here");
    return item;
  }

  async reserve(warehouseId: string, dto: ReserveStockDto, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(StockItem, {
        where: { warehouseId, sku: dto.sku },
        lock: { mode: "pessimistic_write" },
      });
      if (!item) throw new NotFoundException("SKU " + dto.sku + " is not stocked here");

      const available = item.onHand - item.reserved;
      if (dto.quantity > available) {
        throw new ConflictException({ message: "insufficient stock", available });
      }
      item.reserved += dto.quantity;
      await manager.save(item);
      const reservation = await manager.save(
        manager.create(Reservation, {
          stockItemId: item.id,
          quantity: dto.quantity,
          orderRef: dto.orderRef,
          createdBy: userId,
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
        }),
      );
      this.logger.log("reserved " + dto.quantity + " x " + dto.sku + " for " + dto.orderRef);
      return reservation;
    });
  }

  async release(warehouseId: string, reservationId: string, userId?: string) {
    await this.dataSource.transaction(async (manager) => {
      const reservation = await manager.findOne(Reservation, {
        where: { id: reservationId, releasedAt: IsNull() },
        lock: { mode: "pessimistic_write" },
      });
      if (!reservation) throw new NotFoundException("reservation not found");
      const item = await manager.findOne(StockItem, {
        where: { id: reservation.stockItemId, warehouseId },
        lock: { mode: "pessimistic_write" },
      });
      if (!item) throw new NotFoundException("reservation not found");

      item.reserved = Math.max(0, item.reserved - reservation.quantity);
      reservation.releasedAt = new Date();
      reservation.releasedBy = userId ?? null;
      await manager.save(item);
      await manager.save(reservation);
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async releaseExpired() {
    const expired = await this.reservations.find({
      where: { releasedAt: IsNull(), expiresAt: LessThan(new Date()) },
      relations: { stockItem: true },
      take: 100,
    });
    for (const r of expired) {
      await this.release(r.stockItem.warehouseId, r.id).catch((err) =>
        this.logger.warn("could not release " + r.id + ": " + err.message),
      );
    }
  }
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Could `reserve()` deadlock against `release()`? They both take `pessimistic_write` locks.",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Not with the current ordering. A deadlock needs two transactions that each hold a lock the other wants:\n\n1. `reserve()` locks only the **stock item**, then inserts a new reservation row, which nobody else can be holding.\n2. `release()` locks the **reservation**, then the stock item.\n\nSo `release()` may wait for `reserve()` to commit on the stock item, but `reserve()` never waits on a reservation row, so there is no cycle.\n\nThe risk would come later, if someone adds a method that locks the stock item first and then an existing reservation. A short comment saying \"lock reservation before stock item\" would help prevent that.",
      delay: 12000,
    },
    {
      role: "user",
      content:
        "Would an atomic `UPDATE ... WHERE on_hand - reserved >= $qty` be faster than `SELECT FOR UPDATE`?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Usually, yes. A conditional update needs one round trip instead of three and holds the row lock for less time:\n\n```ts\nconst res = await manager.createQueryBuilder()\n  .update(StockItem)\n  .set({ reserved: () => 'reserved + :qty' })\n  .where('id = :id AND on_hand - reserved >= :qty')\n  .setParameters({ id, qty })\n  .execute();\nif (res.affected === 0) throw new ConflictException();\n```\n\nThe downside is that you lose the `available` figure in the 409 body unless you re-query. For a hot SKU during a sale I'd use the atomic update. At current volumes the explicit lock is easier to read and fast enough.",
      delay: 36000,
    },
    {
      role: "user",
      content: "The cron job runs on every replica. Is that a problem?",
      delay: 49000,
    },
    {
      role: "assistant",
      content:
        "It's **correct** but wasteful. Every pod will find the same expired rows. `release()` filters on `releasedAt: IsNull()` under a row lock, so the second pod gets a `NotFoundException`, which the `.catch` logs as a warning. Stock is never double-credited.\n\nTo cut the noise:\n\n1. Add `FOR UPDATE SKIP LOCKED` to the expiry query (`lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' }` inside a transaction) so pods share out the rows.\n2. Or run the job in a single worker by checking an env flag such as `process.env.RUN_SCHEDULER`.\n\nI'd also downgrade the already-released case to `debug` so real failures stand out.",
      delay: 61000,
    },
  ],
};

export default config;
