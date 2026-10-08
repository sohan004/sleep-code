import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "pyramid",
  project: "facilities-workorders",
  branch: "feat/technician-assignment",
  indent: "Spaces: 4",
  files: [
    "setup.py",
    "development.ini",
    "workorders/__init__.py",
    "workorders/routes.py",
    "workorders/security.py",
    "workorders/models/meta.py",
    "workorders/models/work_order.py",
    "workorders/views/work_orders.py",
    "tests/test_work_orders.py",
  ],
  snippets: [
    {
      filename: "workorders/views/work_orders.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `import colander
from pyramid.httpexceptions import HTTPBadRequest, HTTPConflict, HTTPNotFound
from pyramid.httpexceptions import HTTPUnprocessableEntity
from pyramid.view import view_config, view_defaults
from sqlalchemy import select

from ..models.work_order import InvalidTransition, Priority, WorkOrder, WorkOrderStatus

PAGE_SIZE = 100


class CreateWorkOrder(colander.MappingSchema):
    title = colander.SchemaNode(colander.String(), validator=colander.Length(3, 120))
    description = colander.SchemaNode(
        colander.String(), missing="", validator=colander.Length(max=2000)
    )
    site_id = colander.SchemaNode(colander.Integer(), validator=colander.Range(min=1))
    priority = colander.SchemaNode(
        colander.String(), missing="normal", validator=colander.OneOf([p.value for p in Priority])
    )


@view_defaults(renderer="json")
class WorkOrderViews:
    def __init__(self, context, request):
        self.request = request
        self.dbsession = request.dbsession
        self.identity = request.identity

    def _json_body(self):
        try:
            body = self.request.json_body
        except ValueError:
            raise HTTPBadRequest(json_body={"error": "Request body must be valid JSON."})
        if not isinstance(body, dict):
            raise HTTPBadRequest(json_body={"error": "Expected a JSON object."})
        return body

    def _load(self, *, for_update=False):
        # The route pattern only matches digits for {id}, see routes.py.
        stmt = select(WorkOrder).where(
            WorkOrder.id == int(self.request.matchdict["id"]),
            WorkOrder.site_id.in_(self.identity.site_ids),
        )
        if for_update:
            stmt = stmt.with_for_update()
        order = self.dbsession.scalars(stmt).one_or_none()
        if order is None:
            raise HTTPNotFound(json_body={"error": "Work order not found."})
        return order

    @view_config(route_name="work_orders", request_method="GET", permission="view")
    def list(self):
        stmt = (
            select(WorkOrder)
            .where(WorkOrder.site_id.in_(self.identity.site_ids))
            .order_by(WorkOrder.priority_rank.desc(), WorkOrder.created_at)
            .limit(PAGE_SIZE)
        )
        status = self.request.params.get("status")
        if status:
            try:
                stmt = stmt.where(WorkOrder.status == WorkOrderStatus(status))
            except ValueError:
                raise HTTPBadRequest(json_body={"error": f"Unknown status '{status}'."})
        return {"items": [o.to_dict() for o in self.dbsession.scalars(stmt)]}

    @view_config(route_name="work_orders", request_method="POST", permission="create")
    def create(self):
        try:
            data = CreateWorkOrder().deserialize(self._json_body())
        except colander.Invalid as exc:
            raise HTTPUnprocessableEntity(json_body={"errors": exc.asdict()})
        if data["site_id"] not in self.identity.site_ids:
            raise HTTPNotFound(json_body={"error": "Site not found."})
        order = WorkOrder(reported_by=self.identity.user_id, **data)
        self.dbsession.add(order)
        self.dbsession.flush()
        self.request.response.status_code = 201
        return order.to_dict()

    @view_config(route_name="work_order_assign", request_method="POST", permission="assign")
    def assign(self):
        technician_id = self._json_body().get("technician_id")
        if not isinstance(technician_id, int):
            raise HTTPBadRequest(json_body={"error": "technician_id must be an integer."})
        order = self._load(for_update=True)
        try:
            order.assign_to(technician_id, assigned_by=self.identity.user_id)
        except InvalidTransition as exc:
            raise HTTPConflict(json_body={"error": str(exc)})
        return order.to_dict()`,
    },
    {
      filename: "workorders/models/work_order.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `import enum
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, String, Text, case, func
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column

from .meta import Base


class Priority(enum.StrEnum):
    LOW = "low"
    NORMAL = "normal"
    URGENT = "urgent"


class WorkOrderStatus(enum.StrEnum):
    OPEN = "open"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"


class InvalidTransition(Exception):
    """Raised when a work order cannot move to the requested state."""


PRIORITY_RANK = {Priority.LOW: 0, Priority.NORMAL: 1, Priority.URGENT: 2}


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[Priority] = mapped_column(String(16), default=Priority.NORMAL)
    status: Mapped[WorkOrderStatus] = mapped_column(String(16), default=WorkOrderStatus.OPEN)
    reported_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    technician_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    assigned_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    assigned_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]

    @hybrid_property
    def priority_rank(self) -> int:
        return PRIORITY_RANK[Priority(self.priority)]

    @priority_rank.inplace.expression
    @classmethod
    def _priority_rank_expression(cls):
        return case({p.value: rank for p, rank in PRIORITY_RANK.items()}, value=cls.priority)

    def assign_to(self, technician_id: int, *, assigned_by: int) -> None:
        if self.status not in (WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED):
            raise InvalidTransition(f"Cannot assign a work order that is {self.status}.")
        if technician_id == self.reported_by:
            raise InvalidTransition("The reporter cannot be assigned their own work order.")
        self.technician_id = technician_id
        self.assigned_by = assigned_by
        self.status = WorkOrderStatus.ASSIGNED
        self.assigned_at = datetime.now(timezone.utc)

    def complete(self) -> None:
        if self.status is not WorkOrderStatus.IN_PROGRESS:
            raise InvalidTransition("Only work orders in progress can be completed.")
        self.status = WorkOrderStatus.DONE
        self.completed_at = datetime.now(timezone.utc)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "site_id": self.site_id,
            "title": self.title,
            "priority": str(self.priority),
            "status": str(self.status),
            "technician_id": self.technician_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Why does `list()` order by `priority_rank` instead of just `priority`?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "`priority` is stored as a string, so `ORDER BY priority DESC` sorts alphabetically: `urgent`, `normal`, `low`. That looks right today only by coincidence. Add a `high` level and it would land between `normal` and `low`.\n\n`priority_rank` is a hybrid property:\n\n1. On an instance it looks up `PRIORITY_RANK` in Python.\n2. In a query, the `inplace.expression` variant compiles to `CASE priority WHEN 'low' THEN 0 ... END`, so the database sorts by the explicit rank.\n\nIf the list gets large, add a stored generated column or a functional index on that `CASE` expression so the sort can use an index.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Why wrap `request.json_body` in `_json_body()`?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "In Pyramid, `request.json_body` calls `json.loads` lazily, and malformed JSON raises a `ValueError` (`JSONDecodeError`). If that's not caught, it becomes a 500 and an error log entry for what is really a client mistake.\n\nThe helper also checks that the body is an **object**. Valid JSON such as `[1, 2]` or `\"hello\"` would otherwise reach `.get()` and fail with an `AttributeError`, which is another 500.\n\nBoth cases now return a clean 400 with a JSON error. The pattern is worth reusing: move `_json_body` into a small base view class so every view handles bad input the same way.",
      delay: 35000,
    },
    {
      role: "user",
      content: "We filter by `site_ids` in `_load`, but we also have `permission=\"assign\"`. Isn't that redundant?",
      delay: 48000,
    },
    {
      role: "assistant",
      content:
        "They answer different questions:\n\n1. `permission=\"assign\"` is checked by the security policy against the route's context: **can this user assign work orders at all?** A site viewer, for example, can't.\n2. The `site_ids` filter answers **can they act on this particular work order?** Without it, a supervisor at one site could assign technicians to another site's jobs just by changing the ID in the URL.\n\nSo keep both. Returning `HTTPNotFound` rather than `HTTPForbidden` for out-of-scope orders also avoids revealing which IDs exist. A test that assigns an order from a site outside `identity.site_ids` and expects 404 would protect this.",
      delay: 60000,
    },
  ],
};

export default config;
