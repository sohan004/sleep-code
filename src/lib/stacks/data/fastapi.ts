import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "fastapi",
  project: "freight-tracker",
  branch: "feat/shipment-tracking-events",
  indent: "Spaces: 4",
  files: [
    "pyproject.toml",
    "app/main.py",
    "app/auth.py",
    "app/db.py",
    "app/models.py",
    "app/schemas/shipment.py",
    "app/routers/shipments.py",
    "app/services/shipments.py",
    "tests/test_shipments.py",
  ],
  snippets: [
    {
      filename: "app/routers/shipments.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, require_scope
from app.db import get_session
from app.models import ShipmentStatus
from app.schemas.shipment import ShipmentCreate, ShipmentOut, ShipmentPage, TrackingEventIn
from app.services import shipments as service

router = APIRouter(prefix="/shipments", tags=["shipments"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=ShipmentPage)
async def list_shipments(
    session: SessionDep,
    user: CurrentUser,
    status_filter: Annotated[ShipmentStatus | None, Query(alias="status")] = None,
    cursor: Annotated[UUID | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ShipmentPage:
    items, next_cursor = await service.list_for_account(
        session, user.account_id, status_filter, cursor, limit
    )
    return ShipmentPage(
        items=[ShipmentOut.model_validate(s) for s in items],
        next_cursor=next_cursor,
    )


@router.post(
    "",
    response_model=ShipmentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_scope("shipments:write"))],
)
async def create_shipment(
    payload: ShipmentCreate, session: SessionDep, user: CurrentUser
) -> ShipmentOut:
    shipment = await service.create(session, user.account_id, payload)
    return ShipmentOut.model_validate(shipment)


@router.get("/{shipment_id}", response_model=ShipmentOut)
async def get_shipment(shipment_id: UUID, session: SessionDep, user: CurrentUser) -> ShipmentOut:
    shipment = await service.get_for_account(session, user.account_id, shipment_id)
    if shipment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shipment not found")
    return ShipmentOut.model_validate(shipment)


@router.post(
    "/{shipment_id}/events",
    response_model=ShipmentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_scope("tracking:write"))],
)
async def add_tracking_event(
    shipment_id: UUID,
    event: TrackingEventIn,
    session: SessionDep,
    user: CurrentUser,
) -> ShipmentOut:
    shipment = await service.get_for_account(session, user.account_id, shipment_id)
    if shipment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shipment not found")
    try:
        shipment = await service.add_event(session, shipment, event)
    except service.InvalidTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return ShipmentOut.model_validate(shipment)`,
    },
    {
      filename: "app/services/shipments.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Shipment, ShipmentStatus, TrackingEvent
from app.schemas.shipment import ShipmentCreate, TrackingEventIn

S = ShipmentStatus

ALLOWED_TRANSITIONS: dict[ShipmentStatus, set[ShipmentStatus]] = {
    S.CREATED: {S.PICKED_UP, S.CANCELLED},
    S.PICKED_UP: {S.IN_TRANSIT, S.EXCEPTION},
    S.IN_TRANSIT: {S.IN_TRANSIT, S.OUT_FOR_DELIVERY, S.EXCEPTION},
    S.OUT_FOR_DELIVERY: {S.DELIVERED, S.EXCEPTION},
    S.EXCEPTION: {S.IN_TRANSIT, S.RETURNED},
    S.DELIVERED: set(),
    S.CANCELLED: set(),
    S.RETURNED: set(),
}


class InvalidTransitionError(Exception):
    """Raised when a tracking event would move a shipment backwards."""


async def list_for_account(
    session: AsyncSession,
    account_id: UUID,
    status: ShipmentStatus | None,
    cursor: UUID | None,
    limit: int,
) -> tuple[Sequence[Shipment], UUID | None]:
    # Keyset pagination on UUIDv7 ids, which sort by creation time.
    stmt = (
        select(Shipment)
        .where(Shipment.account_id == account_id)
        .order_by(Shipment.id)
        .limit(limit + 1)
    )
    if status is not None:
        stmt = stmt.where(Shipment.status == status)
    if cursor is not None:
        stmt = stmt.where(Shipment.id > cursor)
    rows = (await session.scalars(stmt)).all()
    next_cursor = rows[limit - 1].id if len(rows) > limit else None
    return rows[:limit], next_cursor


async def get_for_account(
    session: AsyncSession, account_id: UUID, shipment_id: UUID
) -> Shipment | None:
    stmt = (
        select(Shipment)
        .where(Shipment.id == shipment_id, Shipment.account_id == account_id)
        .options(selectinload(Shipment.events))
    )
    return await session.scalar(stmt)


async def create(session: AsyncSession, account_id: UUID, data: ShipmentCreate) -> Shipment:
    shipment = Shipment(account_id=account_id, status=S.CREATED, **data.model_dump())
    shipment.events = []
    session.add(shipment)
    await session.commit()
    return shipment


async def add_event(
    session: AsyncSession, shipment: Shipment, data: TrackingEventIn
) -> Shipment:
    if data.status not in ALLOWED_TRANSITIONS[shipment.status]:
        raise InvalidTransitionError(
            f"Cannot move from {shipment.status.value} to {data.status.value}"
        )
    shipment.events.append(
        TrackingEvent(
            status=data.status,
            location=data.location,
            occurred_at=data.occurred_at or datetime.now(UTC),
        )
    )
    shipment.status = data.status
    await session.commit()
    return shipment`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "`ShipmentOut.model_validate(shipment)` raised `MissingGreenlet` when I returned a newly created shipment. What's going on?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "That's the async session refusing an implicit lazy load. `ShipmentOut` includes `events`, so Pydantic (with `from_attributes=True`) reads `shipment.events`. If the relationship isn't loaded, SQLAlchemy tries to run a query synchronously, which an `AsyncSession` can't do, so it raises `MissingGreenlet`.\n\nI fixed it two ways:\n\n1. `get_for_account` uses `selectinload(Shipment.events)`, so the collection is always loaded.\n2. `create` sets `shipment.events = []` before adding it, so the attribute is already populated.\n\nAlso check that your sessionmaker uses `expire_on_commit=False`. Otherwise every attribute expires after `commit()` and the next read triggers the same error.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Is keyset pagination on `Shipment.id` actually stable?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "It's stable, meaning no duplicates or gaps when rows are inserted mid-scroll, because `id` is unique and the `WHERE id > :cursor` predicate always uses the same order. Whether it's **useful** depends on the ID format:\n\n1. With UUIDv4, the order is random, so page 1 is an arbitrary slice rather than the newest shipments.\n2. With UUIDv7, the first 48 bits are a millisecond timestamp, so `ORDER BY id` is roughly creation order. That's why the model generates v7 IDs.\n\nIf you later need \"newest first\" with a status filter, add a composite index on `(account_id, status, id)` so Postgres doesn't filter after the scan.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Should `add_event` lock the shipment row?",
      delay: 48000,
    },
    {
      role: "assistant",
      content:
        "Yes, if carriers can send webhooks concurrently. Two events processed at the same time could both pass the `ALLOWED_TRANSITIONS` check against the same old status, for example `OUT_FOR_DELIVERY` to `DELIVERED` and `OUT_FOR_DELIVERY` to `EXCEPTION`.\n\nThe smallest change is to load the shipment with a lock in the events route:\n\n```python\nstmt = stmt.with_for_update(of=Shipment)\n```\n\n`selectinload` fetches events in a separate query, so the lock applies cleanly. `of=Shipment` keeps it working if someone later switches to `joinedload`, whose outer join Postgres can't lock. Carriers also resend events, so a unique constraint on `(shipment_id, carrier_event_id)` would make those retries idempotent.",
      delay: 60000,
    },
  ],
};

export default config;
