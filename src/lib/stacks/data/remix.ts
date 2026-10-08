import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "remix",
  project: "allotment-waitlist",
  branch: "feat/plot-waitlist-form",
  indent: "Spaces: 2",
  files: [
    "app/root.tsx",
    "app/routes.ts",
    "app/routes/plots.tsx",
    "app/routes/plots.$plotId.tsx",
    "app/models/plot.server.ts",
    "app/sessions.server.ts",
    "app/components/PlotCard.tsx",
    "react-router.config.ts",
    "vite.config.ts",
    "package.json",
  ],
  snippets: [
    {
      filename: "app/routes/plots.tsx",
      syntax: "clike",
      languageLabel: "TypeScript JSX",
      code: `import { data, Form, useNavigation } from "react-router";
import type { Route } from "./+types/plots";
import { requireMemberId } from "~/sessions.server";
import { joinWaitlist, listPlots, WaitlistSchema } from "~/models/plot.server";
import { PlotCard } from "~/components/PlotCard";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: "Garden plots" },
    { name: "description", content: data ? data.plots.length + " plots at this site" : "" },
  ];
}

export function headers() {
  return { "Cache-Control": "private, max-age=30" };
}

export async function loader({ request }: Route.LoaderArgs) {
  const memberId = await requireMemberId(request);
  const url = new URL(request.url);
  const size = url.searchParams.get("size") ?? "any";
  const plots = await listPlots({ size, memberId });
  return { plots, size };
}

export async function action({ request }: Route.ActionArgs) {
  const memberId = await requireMemberId(request);
  const formData = await request.formData();
  const parsed = WaitlistSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const position = await joinWaitlist(memberId, parsed.data);
  return { errors: null, position };
}

export default function Plots({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting" && navigation.formMethod === "POST";
  const errors = actionData?.errors;

  return (
    <main className="plots">
      <h1>Community garden plots</h1>

      <Form method="get" className="filters" preventScrollReset>
        <label htmlFor="size">Plot size</label>
        <select id="size" name="size" defaultValue={loaderData.size}>
          <option value="any">Any size</option>
          <option value="small">Small (up to 10 m2)</option>
          <option value="large">Large (over 10 m2)</option>
        </select>
        <button type="submit">Filter</button>
      </Form>

      <ul className="plot-grid" aria-label="Available plots">
        {loaderData.plots.map((plot) => (
          <li key={plot.id}>
            <PlotCard plot={plot} />
          </li>
        ))}
      </ul>

      <Form method="post" className="waitlist" aria-describedby="waitlist-help">
        <h2>Join the waitlist</h2>
        <p id="waitlist-help">We will email you when a plot becomes available.</p>
        <label htmlFor="preferredSize">Preferred size</label>
        <select
          id="preferredSize"
          name="preferredSize"
          aria-invalid={Boolean(errors?.preferredSize)}
        >
          <option value="small">Small</option>
          <option value="large">Large</option>
        </select>
        {errors?.preferredSize && <p role="alert">{errors.preferredSize[0]}</p>}

        <label htmlFor="notes">Anything we should know?</label>
        <textarea id="notes" name="notes" maxLength={500} rows={3} />
        {errors?.notes && <p role="alert">{errors.notes[0]}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Joining..." : "Join waitlist"}
        </button>
        {actionData?.position && (
          <p role="status">You are number {actionData.position} on the list.</p>
        )}
      </Form>
    </main>
  );
}`,
    },
    {
      filename: "app/models/plot.server.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { z } from "zod";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export type PlotSize = "small" | "large";

export interface Plot {
  id: string;
  label: string;
  areaM2: number;
  size: PlotSize;
  hasWaterTap: boolean;
  available: boolean;
}

export const WaitlistSchema = z.object({
  preferredSize: z.enum(["small", "large"], { message: "Choose a plot size" }),
  notes: z.string().trim().max(500, "Keep notes under 500 characters").optional(),
});

export type WaitlistInput = z.infer<typeof WaitlistSchema>;

export async function listPlots(opts: { size: string; memberId: string }): Promise<Plot[]> {
  const size = opts.size === "small" || opts.size === "large" ? opts.size : null;

  // Parameterised query: user input never gets concatenated into SQL
  const result = await pool.query<Plot>(
    "SELECT id, label, area_m2 AS \\"areaM2\\", size, has_water_tap AS \\"hasWaterTap\\", " +
      "available FROM plots WHERE ($1::text IS NULL OR size = $1) ORDER BY label LIMIT 100",
    [size],
  );
  return result.rows;
}

export async function joinWaitlist(memberId: string, input: WaitlistInput): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT 1 FROM waitlist WHERE member_id = $1 AND preferred_size = $2",
      [memberId, input.preferredSize],
    );

    if (existing.rowCount === 0) {
      await client.query(
        "INSERT INTO waitlist (member_id, preferred_size, notes) VALUES ($1, $2, $3)",
        [memberId, input.preferredSize, input.notes ?? null],
      );
    }

    const position = await client.query<{ position: number }>(
      "SELECT COUNT(*)::int AS position FROM waitlist WHERE preferred_size = $1 " +
        "AND created_at <= (SELECT created_at FROM waitlist WHERE member_id = $2 " +
        "AND preferred_size = $1)",
      [input.preferredSize, memberId],
    );

    await client.query("COMMIT");
    return position.rows[0]?.position ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content: "Where do the Route.LoaderArgs types come from? I don't see a +types folder in the repo.",
      delay: 3000,
    },
    {
      role: "assistant",
      content: "They are generated by React Router's typegen. In framework mode, `react-router typegen` (also run automatically by the Vite plugin in dev) writes files to `.react-router/types`, and `rootDirs` in `tsconfig.json` makes `./+types/plots` resolve to them.\n\nThat is why `loaderData` and `actionData` are typed without generics: the types are inferred from your actual `loader` and `action` return values. Add `.react-router/` to `.gitignore` and run `react-router typegen` before `tsc` in CI so type-checking does not fail on a clean checkout.",
      delay: 12000,
    },
    {
      role: "user",
      content: "If two people join at the same moment, can the position be wrong?",
      delay: 26000,
    },
    {
      role: "assistant",
      content: "The position is a count of rows created at or before yours, so concurrent inserts do not corrupt it, but two things are worth tightening:\n\n1. The `SELECT` then `INSERT` check is racy under the default `READ COMMITTED` isolation. Add a **unique constraint** on `(member_id, preferred_size)` and use `INSERT ... ON CONFLICT DO NOTHING` instead.\n2. Two rows with an identical `created_at` would share a position. Order by a sequence column (`id bigserial`) rather than the timestamp.\n\nWith the constraint in place, you can drop the existence check entirely.",
      delay: 38000,
    },
    {
      role: "user",
      content: "Should the waitlist form use useFetcher instead of Form?",
      delay: 52000,
    },
    {
      role: "assistant",
      content: "I would switch, yes. A `<Form method=\"post\">` triggers a navigation, so after the action React Router revalidates every loader on the page, including `listPlots`, even though joining the waitlist does not change the plots.\n\nWith `useFetcher`, the submission runs without navigating and you read the result from `fetcher.data`. You can also add `shouldRevalidate` to the route to skip reloading plots after this action. Keep the filter as a plain `Form method=\"get\"` since it should update the URL.",
      delay: 64000,
    },
  ],
};

export default config;
