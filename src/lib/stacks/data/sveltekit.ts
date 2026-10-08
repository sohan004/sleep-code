import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "sveltekit",
  project: "bookclub-reading-log",
  branch: "feat/reading-progress",
  indent: "Spaces: 2",
  files: [
    "src/app.html",
    "src/hooks.server.ts",
    "src/lib/server/db.ts",
    "src/lib/components/ProgressBar.svelte",
    "src/routes/+layout.svelte",
    "src/routes/books/+page.server.ts",
    "src/routes/books/+page.svelte",
    "svelte.config.js",
    "vite.config.ts",
    "package.json",
  ],
  snippets: [
    {
      filename: "src/routes/books/+page.server.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { error, fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { db } from "$lib/server/db";
import type { Actions, PageServerLoad } from "./$types";

const ProgressSchema = z.object({
  bookId: z.string().uuid(),
  page: z.coerce.number().int().min(0).max(5000),
});

const AddBookSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  totalPages: z.coerce.number().int().min(1, "Must have at least one page").max(5000),
});

export const load: PageServerLoad = async ({ locals, depends, setHeaders }) => {
  if (!locals.user) redirect(303, "/login?redirectTo=/books");

  depends("app:books");
  setHeaders({ "cache-control": "private, no-store" });

  const books = await db.book.findMany({
    where: { readerId: locals.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, totalPages: true, currentPage: true, updatedAt: true },
  });

  return {
    books,
    // Streamed: the page renders before this resolves
    clubStats: db.club.statsForReader(locals.user.id),
  };
};

export const actions: Actions = {
  progress: async ({ request, locals }) => {
    if (!locals.user) error(401, "Not signed in");

    const form = Object.fromEntries(await request.formData());
    const parsed = ProgressSchema.safeParse(form);
    if (!parsed.success) return fail(400, { progressError: "Enter a valid page number" });

    const { bookId, page } = parsed.data;
    const book = await db.book.findFirst({ where: { id: bookId, readerId: locals.user.id } });
    if (!book) error(404, "Book not found");

    if (page > book.totalPages) {
      return fail(400, { progressError: "That book only has " + book.totalPages + " pages" });
    }

    await db.book.update({ where: { id: bookId }, data: { currentPage: page } });
    return { updated: bookId };
  },

  add: async ({ request, locals }) => {
    if (!locals.user) error(401, "Not signed in");

    const form = Object.fromEntries(await request.formData());
    const parsed = AddBookSchema.safeParse(form);
    if (!parsed.success) {
      return fail(400, {
        values: { title: String(form.title ?? "") },
        addErrors: parsed.error.flatten().fieldErrors,
      });
    }

    await db.book.create({ data: { ...parsed.data, readerId: locals.user.id, currentPage: 0 } });
    return { added: true };
  },
};`,
    },
    {
      filename: "src/routes/books/+page.svelte",
      syntax: "clike",
      languageLabel: "Svelte",
      code: `<script lang="ts">
  import { enhance } from "$app/forms";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  let adding = $state(false);
  let savingId = $state<string | null>(null);

  const finished = $derived(data.books.filter((b) => b.currentPage >= b.totalPages).length);

  function percent(current: number, total: number) {
    return Math.min(100, Math.round((current / total) * 100));
  }
</script>

<svelte:head>
  <title>My reading log</title>
</svelte:head>

<h1>My reading log</h1>
<p>{finished} of {data.books.length} books finished</p>

{#await data.clubStats}
  <p role="status">Loading club stats...</p>
{:then stats}
  <p>Club average: {stats.averagePagesPerWeek} pages a week</p>
{:catch}
  <p>Club stats are unavailable right now.</p>
{/await}

<ul class="books">
  {#each data.books as book (book.id)}
    <li>
      <h2>{book.title}</h2>
      <ProgressBar value={percent(book.currentPage, book.totalPages)} label={book.title} />
      <form
        method="POST"
        action="?/progress"
        use:enhance={() => {
          savingId = book.id;
          return async ({ update }) => {
            await update({ reset: false });
            savingId = null;
          };
        }}
      >
        <input type="hidden" name="bookId" value={book.id} />
        <label for={"page-" + book.id}>Current page</label>
        <input id={"page-" + book.id} name="page" type="number" min="0" max={book.totalPages}
          value={book.currentPage} />
        <button type="submit" disabled={savingId === book.id}>Save</button>
      </form>
    </li>
  {/each}
</ul>

{#if form?.progressError}
  <p role="alert">{form.progressError}</p>
{/if}

<form method="POST" action="?/add" use:enhance={() => {
  adding = true;
  return async ({ update }) => {
    await update();
    adding = false;
  };
}}>
  <h2>Add a book</h2>
  <label for="title">Title</label>
  <input id="title" name="title" required maxlength="200" value={form?.values?.title ?? ""}
    aria-invalid={form?.addErrors?.title ? "true" : undefined} />
  {#if form?.addErrors?.title}<p role="alert">{form.addErrors.title[0]}</p>{/if}

  <label for="totalPages">Total pages</label>
  <input id="totalPages" name="totalPages" type="number" min="1" max="5000" required />
  <button type="submit" disabled={adding}>{adding ? "Adding..." : "Add book"}</button>
</form>`,
    },
  ],
  chat: [
    {
      role: "user",
      content: "Is PageProps a real type? I've always used PageData and typed data/form separately.",
      delay: 3000,
    },
    {
      role: "assistant",
      content: "Yes, `PageProps` was added to the generated `./$types` in SvelteKit 2.16. It bundles `data` and `form` (and `params` for layouts via `LayoutProps`) so a single annotation on `$props()` covers everything.\n\n`PageData` and `ActionData` still work, so existing code does not need to change. For new Svelte 5 components, `PageProps` is the tidier option, and the types stay in sync with your `load` and `actions` automatically when `svelte-kit sync` runs.",
      delay: 11000,
    },
    {
      role: "user",
      content: "Why return clubStats as a promise instead of awaiting it?",
      delay: 24000,
    },
    {
      role: "assistant",
      content: "Returning an un-awaited promise from a server `load` makes SvelteKit **stream** it. The page HTML, including the book list, is sent immediately, and the stats arrive later in the same response, rendered by the `{#await}` block.\n\nThe stats query aggregates across the whole club, so it is the slow part. Without streaming, every visit would wait for it before showing anything. Two caveats: streaming needs JavaScript in the browser to fill the block in, and you should handle rejection with `{:catch}`, which this page does.",
      delay: 35000,
    },
    {
      role: "user",
      content: "Do I need to call invalidate('app:books') after saving progress?",
      delay: 49000,
    },
    {
      role: "assistant",
      content: "Not here. When a form submitted with `use:enhance` succeeds, the default `update()` calls `invalidateAll()`, which reruns every `load` on the page. The `depends(\"app:books\")` tag is for other places, for example a client-side timer or another component that changes books outside a form action.\n\nNote `update({ reset: false })` on the progress form keeps the typed value in the input. Also, the progress action already checks `readerId` against `locals.user.id`, so a forged `bookId` cannot change another reader's book.",
      delay: 61000,
    },
  ],
};

export default config;
