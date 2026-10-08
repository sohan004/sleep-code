import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "nextjs",
  project: "freelance-invoicer",
  branch: "feat/invoice-status-actions",
  indent: "Spaces: 2",
  files: [
    "app/layout.tsx",
    "app/invoices/page.tsx",
    "app/invoices/actions.ts",
    "app/invoices/loading.tsx",
    "components/InvoiceRow.tsx",
    "components/MarkPaidButton.tsx",
    "lib/db.ts",
    "lib/auth.ts",
    "next.config.ts",
    "package.json",
  ],
  snippets: [
    {
      filename: "app/invoices/page.tsx",
      syntax: "clike",
      languageLabel: "TypeScript JSX",
      code: `import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listInvoices, type InvoiceStatus } from "@/lib/db";
import { InvoiceRow } from "@/components/InvoiceRow";

export const metadata: Metadata = {
  title: "Invoices",
  description: "Track sent, overdue and paid invoices.",
};

const STATUSES: InvoiceStatus[] = ["draft", "sent", "overdue", "paid"];

type PageProps = {
  searchParams: Promise<{ status?: string; page?: string }>;
};

export default async function InvoicesPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login?next=/invoices");

  const { status, page } = await searchParams;
  const filter = STATUSES.find((s) => s === status);
  if (status && !filter) notFound();

  const pageNumber = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Invoices</h1>

      <nav aria-label="Filter invoices by status" className="my-4 flex gap-2">
        <FilterLink href="/invoices" active={!filter} label="All" />
        {STATUSES.map((s) => (
          <FilterLink key={s} href={"/invoices?status=" + s} active={filter === s} label={s} />
        ))}
      </nav>

      <Suspense key={(filter ?? "all") + pageNumber} fallback={<TableSkeleton />}>
        <InvoiceTable ownerId={session.userId} status={filter} page={pageNumber} />
      </Suspense>
    </main>
  );
}

async function InvoiceTable(props: { ownerId: string; status?: InvoiceStatus; page: number }) {
  const { rows, total } = await listInvoices(props);

  if (rows.length === 0) {
    return <p className="text-muted-foreground">No invoices match this filter.</p>;
  }

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{total} invoices</caption>
      <thead>
        <tr>
          <th scope="col">Number</th>
          <th scope="col">Client</th>
          <th scope="col">Due</th>
          <th scope="col">Amount</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((invoice) => (
          <InvoiceRow key={invoice.id} invoice={invoice} />
        ))}
      </tbody>
    </table>
  );
}

function FilterLink(props: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={props.href}
      aria-current={props.active ? "page" : undefined}
      className={props.active ? "chip chip--active" : "chip"}
    >
      {props.label}
    </Link>
  );
}

function TableSkeleton() {
  return <div className="h-64 animate-pulse rounded-lg bg-muted" aria-hidden="true" />;
}`,
    },
    {
      filename: "app/invoices/actions.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

const MarkPaidSchema = z.object({
  invoiceId: z.string().uuid(),
  paidOn: z.coerce.date().max(new Date(), { message: "Payment date cannot be in the future" }),
  reference: z.string().trim().max(64).optional(),
});

export type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> }
  | null;

export async function markInvoicePaid(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "You need to sign in again." };

  const parsed = MarkPaidSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    paidOn: formData.get("paidOn"),
    reference: formData.get("reference") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { invoiceId, paidOn, reference } = parsed.data;

  // Scope the update to the owner so one user cannot modify another user's invoice
  const updated = await db.invoice.updateMany({
    where: { id: invoiceId, ownerId: session.userId, status: { not: "paid" } },
    data: { status: "paid", paidOn, reference },
  });

  if (updated.count === 0) {
    return { ok: false, message: "Invoice not found or already paid." };
  }

  revalidatePath("/invoices");
  return { ok: true, message: "Invoice marked as paid." };
}

export async function deleteDraft(invoiceId: string): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "You need to sign in again." };

  const id = z.string().uuid().safeParse(invoiceId);
  if (!id.success) return { ok: false, message: "Invalid invoice id." };

  const removed = await db.invoice.deleteMany({
    where: { id: id.data, ownerId: session.userId, status: "draft" },
  });

  revalidatePath("/invoices");
  return removed.count > 0
    ? { ok: true, message: "Draft deleted." }
    : { ok: false, message: "Only drafts can be deleted." };
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content: "Why is searchParams typed as a Promise now? It used to be a plain object.",
      delay: 3000,
    },
    {
      role: "assistant",
      content: "Since Next.js 15, `params` and `searchParams` are async. Reading them is what opts a route into dynamic rendering, so making them a `Promise` lets Next.js render everything that does not depend on them ahead of time and only wait where you actually `await`.\n\nIn Next.js 16 the old synchronous access was removed entirely, so `await searchParams` is required. If you need them in a client component, pass the promise down and unwrap it with React's `use()` hook inside a `Suspense` boundary.",
      delay: 11000,
    },
    {
      role: "user",
      content: "What does the key on Suspense do? The table already re-renders when the filter changes.",
      delay: 24000,
    },
    {
      role: "assistant",
      content: "Without the `key`, React treats the boundary as the same instance across navigations. During a transition, it keeps showing the **old** table while the new data loads, and the skeleton never appears.\n\nChanging the `key` when the filter or page changes forces React to remount the boundary, so the fallback shows immediately. That gives clear feedback that the filter was applied. If you prefer the stale-while-loading behaviour, drop the key and instead show a subtle pending indicator with `useLinkStatus` on the filter links.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Is the server action safe? Anyone could POST to it directly.",
      delay: 50000,
    },
    {
      role: "assistant",
      content: "Treat every server action as a public endpoint, because it is. This one covers the main points:\n\n1. **Authentication**: `getSession()` is checked inside the action, not just on the page.\n2. **Authorisation**: `ownerId: session.userId` in the `where` clause stops a user changing someone else's invoice, even with a valid ID.\n3. **Validation**: Zod parses every field from `FormData`, so unexpected types never reach the database.\n\nNext.js also checks the `Origin` header against the host for actions. Add a rate limit if this is exposed to many users.",
      delay: 63000,
    },
  ],
};

export default config;
