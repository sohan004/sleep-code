import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "svelte",
  project: "greenhouse-watering",
  branch: "feat/watering-schedule",
  indent: "Spaces: 2",
  files: [
    "src/main.ts",
    "src/App.svelte",
    "src/lib/plants.svelte.ts",
    "src/lib/components/WateringList.svelte",
    "src/lib/components/PlantCard.svelte",
    "src/lib/types.ts",
    "vite.config.ts",
    "svelte.config.js",
    "package.json",
  ],
  snippets: [
    {
      filename: "src/lib/components/WateringList.svelte",
      syntax: "clike",
      languageLabel: "Svelte",
      code: `<script lang="ts">
  import { onMount } from "svelte";
  import { PlantStore } from "$lib/plants.svelte";
  import type { Plant } from "$lib/types";

  interface Props {
    zoneId: string;
    onwatered?: (plant: Plant) => void;
  }

  let { zoneId, onwatered }: Props = $props();

  const FILTERS = ["due", "overdue", "all"] as const;
  const store = new PlantStore();
  let filter = $state<"all" | "due" | "overdue">("due");
  let announcement = $state("");

  const visible = $derived(
    filter === "all" ? store.plants : store.plants.filter((p) => store.statusOf(p) === filter),
  );
  const overdueCount = $derived(store.plants.filter((p) => store.statusOf(p) === "overdue").length);

  $effect(() => {
    const controller = new AbortController();
    store.load(zoneId, controller.signal);
    return () => controller.abort();
  });

  onMount(() => {
    const timer = setInterval(() => store.tick(), 60_000);
    return () => clearInterval(timer);
  });

  async function water(plant: Plant) {
    const ok = await store.markWatered(plant.id);
    announcement = ok ? plant.name + " marked as watered" : "Could not update " + plant.name;
    if (ok) onwatered?.(plant);
  }
</script>

<section aria-labelledby="watering-heading">
  <h2 id="watering-heading">Watering schedule</h2>

  {#if overdueCount > 0}
    <p class="warning">{overdueCount} plants are overdue</p>
  {/if}

  <fieldset>
    <legend>Show</legend>
    {#each FILTERS as option (option)}
      <label>
        <input type="radio" name="filter" value={option} bind:group={filter} />
        {option}
      </label>
    {/each}
  </fieldset>

  {#if store.error}
    <p role="alert">{store.error}</p>
  {:else if store.loading}
    <p role="status">Loading plants...</p>
  {:else}
    <ul class="plant-list">
      {#each visible as plant (plant.id)}
        <li class="plant" data-status={store.statusOf(plant)}>
          <span class="plant__name">{plant.name}</span>
          <span class="plant__meta">every {plant.intervalDays} days</span>
          <button type="button" onclick={() => water(plant)} disabled={store.pending.has(plant.id)}>
            Water <span class="visually-hidden">{plant.name}</span>
          </button>
        </li>
      {:else}
        <li>Nothing to water right now.</li>
      {/each}
    </ul>
  {/if}

  <p class="visually-hidden" role="status" aria-live="polite">{announcement}</p>
</section>`,
    },
    {
      filename: "src/lib/plants.svelte.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { SvelteSet } from "svelte/reactivity";
import type { Plant, PlantStatus } from "./types";

const API_URL = import.meta.env.VITE_GREENHOUSE_API_URL;
const DAY_MS = 24 * 60 * 60 * 1000;

function isPlant(value: unknown): value is Plant {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string"
    && typeof v.intervalDays === "number" && typeof v.lastWatered === "string";
}

export class PlantStore {
  plants = $state<Plant[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  pending = new SvelteSet<string>();
  now = $state(Date.now());

  dueCount = $derived(this.plants.filter((p) => this.statusOf(p) !== "ok").length);

  tick() {
    this.now = Date.now();
  }

  statusOf(plant: Plant): PlantStatus {
    const nextDue = Date.parse(plant.lastWatered) + plant.intervalDays * DAY_MS;
    if (this.now > nextDue + DAY_MS) return "overdue";
    if (this.now > nextDue) return "due";
    return "ok";
  }

  async load(zoneId: string, signal: AbortSignal) {
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch(API_URL + "/zones/" + encodeURIComponent(zoneId) + "/plants", {
        signal,
      });
      if (!res.ok) throw new Error("Server returned " + res.status);
      const data: unknown = await res.json();
      this.plants = Array.isArray(data) ? data.filter(isPlant) : [];
    } catch (err) {
      if (signal.aborted) return;
      this.error = err instanceof Error ? err.message : "Failed to load plants";
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  async markWatered(plantId: string): Promise<boolean> {
    this.pending.add(plantId);
    const previous = this.plants;
    const stamp = new Date().toISOString();
    this.plants = this.plants.map((p) => (p.id === plantId ? { ...p, lastWatered: stamp } : p));

    try {
      const res = await fetch(API_URL + "/plants/" + encodeURIComponent(plantId) + "/water", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Server returned " + res.status);
      return true;
    } catch {
      this.plants = previous;
      return false;
    } finally {
      this.pending.delete(plantId);
    }
  }
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content: "Why does the store live in a .svelte.ts file instead of a normal .ts file?",
      delay: 3000,
    },
    {
      role: "assistant",
      content: "Runes like `$state` and `$derived` are compiler features, and Svelte only processes them in `.svelte` components and `.svelte.ts` / `.svelte.js` modules. In a plain `.ts` file, `$state` would just be an undefined function at runtime.\n\nUsing class fields with `$state` is the idiomatic Svelte 5 pattern for shared logic: each field becomes a reactive getter and setter, so `store.plants` and `store.loading` stay reactive when read from the component. Just avoid destructuring them, as that copies the current value and loses reactivity.",
      delay: 12000,
    },
    {
      role: "user",
      content: "statusOf depends on Date.now(). How does the list update when time passes?",
      delay: 25000,
    },
    {
      role: "assistant",
      content: "That is what the `now` field is for. `statusOf` reads `this.now`, which is `$state`, so any `$derived` or template expression calling it re-runs when `now` changes. The `onMount` interval calls `store.tick()` every minute to bump it.\n\nIf you called `Date.now()` directly inside `statusOf`, Svelte would have no dependency to track and the overdue warning would never appear until something else changed. One minute granularity is plenty here, and it keeps re-render cost low.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Could I use $effect to update the announcement text instead of setting it in water()?",
      delay: 49000,
    },
    {
      role: "assistant",
      content: "You could, but I would not. Using `$effect` to set state from other state is a common anti-pattern in Svelte 5: it causes an extra update cycle and makes the data flow harder to follow. The docs suggest `$derived` when one value is computed from another, and an event handler when it responds to a user action.\n\nThe announcement is a direct result of the click, so setting it in `water()` is the right place. Keep `$effect` for real side effects, like the fetch with its `AbortController` cleanup.",
      delay: 60000,
    },
  ],
};

export default config;
