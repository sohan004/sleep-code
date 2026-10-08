import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "django",
  project: "ledger-portal",
  branch: "feat/invoice-issue-flow",
  indent: "Spaces: 4",
  files: [
    "manage.py",
    "pyproject.toml",
    "config/settings.py",
    "config/urls.py",
    "billing/models.py",
    "billing/permissions.py",
    "billing/serializers.py",
    "billing/views.py",
    "billing/tests/test_invoices.py",
  ],
  snippets: [
    {
      filename: "billing/views.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `from django.db import transaction
from django.db.models import Prefetch, Sum
from django.http import FileResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import OrderingFilter
from rest_framework.response import Response

from .models import Invoice, InvoiceLine
from .pdf import render_invoice_pdf
from .permissions import IsBillingStaff
from .serializers import InvoiceSerializer


class InvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [permissions.IsAuthenticated, IsBillingStaff]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["status", "customer", "currency"]
    ordering_fields = ["issue_date", "due_date", "total"]
    ordering = ["-issue_date", "-id"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def base_queryset(self):
        # Tenant scoping lives here so every action inherits it.
        return Invoice.objects.filter(organisation=self.request.user.organisation)

    def get_queryset(self):
        return (
            self.base_queryset()
            .select_related("customer")
            .prefetch_related(Prefetch("lines", queryset=InvoiceLine.objects.order_by("id")))
        )

    def perform_destroy(self, instance):
        if instance.status != Invoice.Status.DRAFT:
            raise ValidationError("Only draft invoices can be deleted.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def issue(self, request, pk=None):
        invoice = self.get_object()
        with transaction.atomic():
            # Re-read under a row lock so a double click can't issue twice.
            locked = self.base_queryset().select_for_update().get(pk=invoice.pk)
            if locked.status != Invoice.Status.DRAFT:
                return Response(
                    {"detail": "Invoice has already been issued."},
                    status=status.HTTP_409_CONFLICT,
                )
            locked.issue(issued_by=request.user)
        invoice.refresh_from_db()
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        return FileResponse(
            render_invoice_pdf(invoice),
            as_attachment=True,
            filename=f"invoice-{invoice.number}.pdf",
            content_type="application/pdf",
        )

    @action(detail=False, methods=["get"])
    def summary(self, request):
        queryset = self.filter_queryset(self.base_queryset())
        totals = (
            queryset.values("currency", "status")
            .annotate(amount=Sum("total"))
            .order_by("currency", "status")
        )
        return Response(list(totals))`,
    },
    {
      filename: "billing/serializers.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import Customer, Invoice, InvoiceLine

MAX_LINES = 200


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = ["id", "description", "quantity", "unit_price", "tax_rate", "line_total"]
        read_only_fields = ["id", "line_total"]

    def validate_tax_rate(self, value):
        if not Decimal("0") <= value <= Decimal("0.5"):
            raise serializers.ValidationError("Tax rate must be between 0 and 0.5.")
        return value


class InvoiceSerializer(serializers.ModelSerializer):
    lines = InvoiceLineSerializer(many=True)
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.none())
    total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "number", "customer", "issue_date", "due_date",
            "status", "currency", "lines", "total",
        ]
        read_only_fields = ["id", "number", "status", "total"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            # Only customers in the caller's organisation are selectable.
            self.fields["customer"].queryset = Customer.objects.filter(
                organisation=request.user.organisation
            )

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("At least one line is required.")
        if len(value) > MAX_LINES:
            raise serializers.ValidationError(f"No more than {MAX_LINES} lines per invoice.")
        return value

    def validate(self, attrs):
        current = self.instance
        issue_date = attrs.get("issue_date", getattr(current, "issue_date", timezone.localdate()))
        due_date = attrs.get("due_date", getattr(current, "due_date", None))
        if due_date and due_date < issue_date:
            raise serializers.ValidationError({"due_date": "Due date cannot precede issue date."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop("lines")
        request = self.context["request"]
        invoice = Invoice.objects.create(
            organisation=request.user.organisation,
            created_by=request.user,
            **validated_data,
        )
        InvoiceLine.objects.bulk_create(InvoiceLine(invoice=invoice, **line) for line in lines)
        invoice.recalculate_total()
        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        if instance.status != Invoice.Status.DRAFT:
            raise serializers.ValidationError("Only draft invoices can be edited.")
        lines = validated_data.pop("lines", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            InvoiceLine.objects.bulk_create(
                InvoiceLine(invoice=instance, **line) for line in lines
            )
        instance.recalculate_total()
        return instance`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Why does `issue()` call `get_object()` and then fetch the invoice again with `select_for_update()`?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "They do different jobs. `get_object()` runs the permission checks, including `has_object_permission` on `IsBillingStaff`, and returns a 404 for invoices outside the user's organisation. We want that behaviour, but it reads the row **without** a lock.\n\nThe second query runs inside `transaction.atomic()` and adds `SELECT ... FOR UPDATE`. If two requests arrive together, the second one blocks until the first commits, then sees `status = issued` and returns 409. Without the lock, both would pass the `DRAFT` check and you'd allocate two invoice numbers.\n\n`select_for_update()` raises `TransactionManagementError` outside an atomic block, so the `with` is required.",
      delay: 12000,
    },
    {
      role: "user",
      content: "`bulk_create` skips `save()`. Won't `line_total` be empty?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Not in this model. `line_total` is a Django 5 `GeneratedField`:\n\n```python\nline_total = models.GeneratedField(\n    expression=F('quantity') * F('unit_price'),\n    output_field=models.DecimalField(max_digits=12, decimal_places=2),\n    db_persist=True,\n)\n```\n\nThe database calculates it, so it is correct no matter how the row is inserted, including `bulk_create` and raw SQL. The catch is that instances returned by `bulk_create` don't have the value loaded. `recalculate_total()` aggregates in SQL, so that's fine, but read the lines back from the database before serialising them.",
      delay: 35000,
    },
    {
      role: "user",
      content: "Is the `customer` queryset override actually needed? We filter the viewset already.",
      delay: 47000,
    },
    {
      role: "assistant",
      content:
        "Yes, it closes a separate hole. The viewset's `get_queryset` controls which **invoices** a user can read or edit. It doesn't affect which **customer IDs** a client can send in the body.\n\nWith `Customer.objects.all()`, a user could POST an invoice pointing at another organisation's customer ID. DRF would accept it, and the PDF would then render that customer's billing details. This is a classic IDOR.\n\nStarting from `.none()` and narrowing it in `__init__` means a foreign ID gets the standard \"Invalid pk - object does not exist\" error, which also avoids confirming that the ID exists. A regression test that posts a foreign `customer` and expects 400 would cover this.",
      delay: 58000,
    },
  ],
};

export default config;
