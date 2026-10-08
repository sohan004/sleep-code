import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "flask",
  project: "expense-tracker",
  branch: "feat/claim-approvals",
  indent: "Spaces: 4",
  files: [
    "pyproject.toml",
    "app/__init__.py",
    "app/extensions.py",
    "app/employees/models.py",
    "app/expenses/__init__.py",
    "app/expenses/models.py",
    "app/expenses/routes.py",
    "migrations/env.py",
    "tests/test_expenses.py",
  ],
  snippets: [
    {
      filename: "app/expenses/routes.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `from datetime import date
from decimal import Decimal

from flask import Blueprint, abort, jsonify, request
from flask_login import current_user, login_required
from marshmallow import Schema, ValidationError, fields, validate
from sqlalchemy import select

from app.expenses.models import ExpenseClaim, InvalidTransition
from app.extensions import db

bp = Blueprint("expenses", __name__, url_prefix="/api/expenses")

CATEGORIES = ["travel", "meals", "accommodation", "equipment", "training"]
MAX_CLAIM = Decimal("10000.00")


class ClaimInput(Schema):
    category = fields.String(required=True, validate=validate.OneOf(CATEGORIES))
    description = fields.String(required=True, validate=validate.Length(min=3, max=255))
    amount = fields.Decimal(
        required=True, places=2, validate=validate.Range(min=Decimal("0.01"), max=MAX_CLAIM)
    )
    currency = fields.String(load_default="AUD", validate=validate.Length(equal=3))
    incurred_on = fields.Date(required=True)


claim_input = ClaimInput()


def serialise(claim: ExpenseClaim) -> dict:
    return {
        "id": claim.id,
        "category": claim.category,
        "description": claim.description,
        "amount": str(claim.amount),
        "currency": claim.currency,
        "incurred_on": claim.incurred_on.isoformat(),
        "status": claim.status.value,
    }


@bp.errorhandler(ValidationError)
def handle_validation(err: ValidationError):
    return jsonify(errors=err.messages), 422


@bp.errorhandler(InvalidTransition)
def handle_transition(err: InvalidTransition):
    return jsonify(error=str(err)), 409


@bp.post("/")
@login_required
def create_claim():
    data = claim_input.load(request.get_json(silent=True) or {})
    if data["incurred_on"] > date.today():
        raise ValidationError({"incurred_on": ["Cannot be in the future."]})
    claim = ExpenseClaim(employee_id=current_user.id, **data)
    db.session.add(claim)
    db.session.commit()
    return jsonify(serialise(claim)), 201


@bp.post("/<int:claim_id>/submit")
@login_required
def submit_claim(claim_id: int):
    claim = db.get_or_404(ExpenseClaim, claim_id)
    if claim.employee_id != current_user.id:
        abort(404)
    claim.submit()
    db.session.commit()
    return jsonify(serialise(claim))


@bp.post("/<int:claim_id>/decision")
@login_required
def decide_claim(claim_id: int):
    stmt = select(ExpenseClaim).where(ExpenseClaim.id == claim_id).with_for_update()
    claim = db.session.scalars(stmt).one_or_none()
    if claim is None or claim.employee.manager_id != current_user.id:
        abort(404)
    approved = (request.get_json(silent=True) or {}).get("approved")
    if not isinstance(approved, bool):
        raise ValidationError({"approved": ["Must be true or false."]})
    claim.decide(current_user, approved=approved)
    db.session.commit()
    return jsonify(serialise(claim))


@bp.get("/pending")
@login_required
def pending_claims():
    page = db.paginate(ExpenseClaim.pending_for_manager(current_user.id), max_per_page=100)
    return jsonify(items=[serialise(c) for c in page.items], total=page.total, page=page.page)`,
    },
    {
      filename: "app/expenses/models.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `from __future__ import annotations

import enum
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Numeric, Select, String, func, select
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.employees.models import Employee
from app.extensions import db


class ClaimStatus(enum.StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"


class InvalidTransition(Exception):
    """Raised when a claim is moved to a status it cannot reach."""


class ExpenseClaim(db.Model):
    __tablename__ = "expense_claims"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_claim_amount_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    approver_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"))
    category: Mapped[str] = mapped_column(String(32))
    description: Mapped[str] = mapped_column(String(255))
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="AUD")
    incurred_on: Mapped[date]
    status: Mapped[ClaimStatus] = mapped_column(
        Enum(ClaimStatus, values_callable=lambda e: [m.value for m in e], native_enum=False),
        default=ClaimStatus.DRAFT,
        index=True,
    )
    submitted_at: Mapped[datetime | None]
    decided_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    employee: Mapped[Employee] = relationship(foreign_keys=[employee_id], lazy="joined")
    approver: Mapped[Employee | None] = relationship(foreign_keys=[approver_id])

    def submit(self) -> None:
        if self.status is not ClaimStatus.DRAFT:
            raise InvalidTransition(f"Cannot submit a claim that is {self.status.value}.")
        self.status = ClaimStatus.SUBMITTED
        self.submitted_at = datetime.now(timezone.utc)

    def decide(self, approver: Employee, *, approved: bool) -> None:
        if self.status is not ClaimStatus.SUBMITTED:
            raise InvalidTransition("Only submitted claims can be approved or rejected.")
        if approver.id == self.employee_id:
            raise InvalidTransition("You cannot approve your own claim.")
        self.status = ClaimStatus.APPROVED if approved else ClaimStatus.REJECTED
        self.approver_id = approver.id
        self.decided_at = datetime.now(timezone.utc)

    @classmethod
    def pending_for_manager(cls, manager_id: int) -> Select[tuple[ExpenseClaim]]:
        return (
            select(cls)
            .join(cls.employee)
            .where(Employee.manager_id == manager_id, cls.status == ClaimStatus.SUBMITTED)
            .order_by(cls.submitted_at, cls.id)
        )

    def __repr__(self) -> str:
        return f"<ExpenseClaim {self.id} {self.status.value} {self.amount} {self.currency}>"`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Why pass `values_callable` to `Enum`? SQLAlchemy maps `Mapped[ClaimStatus]` automatically.",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "It does, but by default SQLAlchemy stores the enum member **names** (`'DRAFT'`, `'SUBMITTED'`), not the values. Because `ClaimStatus` is a `StrEnum` with lowercase values, the database would hold uppercase strings while the JSON API returns lowercase ones. That trips up anyone writing reporting SQL or a migration.\n\n`values_callable=lambda e: [m.value for m in e]` tells SQLAlchemy to persist `'draft'`, `'submitted'` and so on. `native_enum=False` stores it as a `VARCHAR` with a CHECK constraint instead of a Postgres `ENUM` type, so adding a status later is a simple Alembic migration rather than `ALTER TYPE`.",
      delay: 12000,
    },
    {
      role: "user",
      content: "What does `with_for_update()` protect against in `decide_claim`?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Two managers, or one manager with two tabs, approving and rejecting the same claim at the same moment. Without a lock, both requests load the claim as `SUBMITTED`, both pass the check in `decide()`, and the last commit wins. The audit trail would then show an approval that was silently overwritten.\n\nWith `SELECT ... FOR UPDATE`, the second request blocks until the first commits, re-reads the row, sees `APPROVED`, and gets a 409 from `InvalidTransition`.\n\nOne caveat: `lazy=\"joined\"` on `employee` adds a LEFT OUTER JOIN to that query, and Postgres refuses `FOR UPDATE` on the nullable side of an outer join. Use `with_for_update(of=ExpenseClaim)` to lock only the claim row.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Good catch. Anything else you'd test before merging?",
      delay: 49000,
    },
    {
      role: "assistant",
      content:
        "A few cases with pytest and the Flask test client:\n\n1. **Self-approval**: a manager who submits their own claim gets 409 when deciding on it.\n2. **Cross-team access**: a manager deciding on a claim from another team gets 404, not 403, so claim IDs don't leak.\n3. **Boundaries**: `amount` of `0.00` and `10000.01` give 422, and `10000.00` is accepted.\n4. **Future date**: `incurred_on` set to tomorrow gives 422.\n5. **Non-boolean `approved`**: the string `\"true\"` is rejected, which confirms the `isinstance` check.\n\nFor the locking fix, a unit test can assert that the compiled SQL contains `FOR UPDATE OF expense_claims`.",
      delay: 60000,
    },
  ],
};

export default config;
