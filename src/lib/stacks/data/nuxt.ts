import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "nuxt",
  project: "trail-conditions",
  branch: "feat/trail-detail-page",
  indent: "Spaces: 2",
  files: [
    "app/app.vue",
    "app/pages/index.vue",
    "app/pages/trails/[slug].vue",
    "app/components/ConditionBadge.vue",
    "app/composables/useUnits.ts",
    "server/api/trails/[slug].get.ts",
    "server/utils/weather.ts",
    "shared/types/trail.ts",
    "nuxt.config.ts",
    "package.json",
  ],
  snippets: [
    {
      filename: "app/pages/trails/[slug].vue",
      syntax: "clike",
      languageLabel: "Vue",
      code: `<script setup lang="ts">
import type { TrailDetail } from "~~/shared/types/trail";

const route = useRoute();
const slug = computed(() => String(route.params.slug));
const { formatDistance, formatElevation } = useUnits();

const { data: trail, status, error, refresh } = await useFetch<TrailDetail>(
  () => "/api/trails/" + encodeURIComponent(slug.value),
  {
    key: () => "trail-" + slug.value,
    getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  },
);

if (error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: "Trail not found", fatal: true });
}

useSeoMeta({
  title: () => (trail.value ? trail.value.name + " conditions" : "Trail conditions"),
  description: () => trail.value?.summary ?? "Current track and weather conditions.",
  ogImage: () => trail.value?.coverImage,
});

const isClosed = computed(() => trail.value?.condition === "closed");
const lastChecked = computed(() =>
  trail.value ? new Date(trail.value.updatedAt).toLocaleString("en-AU") : "",
);
</script>

<template>
  <main class="trail">
    <NuxtLink to="/" class="back-link">Back to all trails</NuxtLink>

    <p v-if="status === 'pending'" role="status">Loading trail...</p>

    <div v-else-if="error" role="alert">
      <p>We could not load this trail right now.</p>
      <button type="button" @click="refresh()">Try again</button>
    </div>

    <article v-else-if="trail" :aria-labelledby="'trail-' + trail.slug">
      <header>
        <h1 :id="'trail-' + trail.slug">{{ trail.name }}</h1>
        <ConditionBadge :condition="trail.condition" />
      </header>

      <NuxtImg
        v-if="trail.coverImage"
        :src="trail.coverImage"
        :alt="trail.coverAlt"
        width="960"
        height="540"
        sizes="sm:100vw md:720px lg:960px"
        loading="lazy"
      />

      <p v-if="isClosed" class="notice" role="note">
        This trail is closed. Check park alerts before travelling.
      </p>

      <dl class="stats">
        <dt>Distance</dt>
        <dd>{{ formatDistance(trail.distanceKm) }}</dd>
        <dt>Elevation gain</dt>
        <dd>{{ formatElevation(trail.elevationM) }}</dd>
        <dt>Forecast high</dt>
        <dd>{{ trail.weather.maxTempC }} &deg;C</dd>
      </dl>

      <p class="updated">Last checked {{ lastChecked }}</p>
    </article>
  </main>
</template>`,
    },
    {
      filename: "server/api/trails/[slug].get.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { z } from "zod";
import type { TrailDetail } from "~~/shared/types/trail";
import { fetchForecast } from "../../utils/weather";

const ParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/, "Invalid trail slug"),
});

interface TrailRecord {
  slug: string;
  name: string;
  summary: string;
  condition: TrailDetail["condition"];
  distanceKm: number;
  elevationM: number;
  lat: number;
  lon: number;
  coverImage: string | null;
  coverAlt: string;
  updatedAt: string;
}

export default defineCachedEventHandler(
  async (event): Promise<TrailDetail> => {
    const { slug } = await getValidatedRouterParams(event, ParamsSchema.parse);
    const config = useRuntimeConfig(event);

    const record = await $fetch<TrailRecord | null>("/trails/" + slug, {
      baseURL: config.parksApiBase,
      headers: { Authorization: "Bearer " + config.parksApiToken },
      retry: 1,
      timeout: 5000,
    }).catch((err) => {
      if (err?.statusCode === 404) return null;
      throw createError({ statusCode: 502, statusMessage: "Upstream parks service failed" });
    });

    if (!record) {
      throw createError({ statusCode: 404, statusMessage: "Trail not found" });
    }

    // Weather is non-critical: fall back to an empty forecast rather than failing the page
    const weather = await fetchForecast(record.lat, record.lon).catch(() => ({
      maxTempC: null,
      rainChancePct: null,
    }));

    return {
      slug: record.slug,
      name: record.name,
      summary: record.summary,
      condition: record.condition,
      distanceKm: record.distanceKm,
      elevationM: record.elevationM,
      coverImage: record.coverImage,
      coverAlt: record.coverAlt,
      updatedAt: record.updatedAt,
      weather,
    };
  },
  {
    name: "trail-detail",
    maxAge: 60 * 10,
    swr: true,
    getKey: (event) => getRouterParam(event, "slug") ?? "unknown",
  },
);`,
    },
  ],
  chat: [
    {
      role: "user",
      content: "Where should the parks API token live? I don't want it in the client bundle.",
      delay: 3000,
    },
    {
      role: "assistant",
      content: "Put it in `runtimeConfig` at the top level, not under `public`:\n\n```ts\nruntimeConfig: {\n  parksApiToken: \"\",\n  parksApiBase: \"\",\n}\n```\n\nThen set `NUXT_PARKS_API_TOKEN` and `NUXT_PARKS_API_BASE` in the environment. Nuxt overrides the empty defaults at runtime, and private keys are only available to server code via `useRuntimeConfig(event)`. Because the page calls your own `/api/trails` route, the browser never sees the token or the upstream URL.",
      delay: 11500,
    },
    {
      role: "user",
      content: "With swr: true, could someone see a trail marked open after it's been closed?",
      delay: 25000,
    },
    {
      role: "assistant",
      content: "Yes, briefly. With `swr: true` and `maxAge` of 10 minutes, Nitro serves the cached response and refreshes it in the background once it is stale. A closure could take up to about 10 minutes plus one request to appear.\n\nFor safety information that is probably too long. Options:\n\n1. Lower `maxAge` to 60 seconds; the upstream load stays small.\n2. Have the parks service call a webhook that removes the cached entry for that slug when a condition changes.\n3. Keep the long cache for static fields and fetch `condition` separately with a short cache.",
      delay: 37000,
    },
    {
      role: "user",
      content: "Is getCachedData in useFetch still needed in Nuxt 4?",
      delay: 51000,
    },
    {
      role: "assistant",
      content: "Mostly not. Nuxt 4 shares data between `useFetch` calls with the same `key` and reuses the hydration payload by default, so the custom `getCachedData` here mostly repeats the built-in behaviour.\n\nThe main reason to keep a custom one is when you want client-side navigation back to a trail to reuse data instead of refetching. Note that returning cached data skips the request entirely, so pair it with an age check if you go that way. Otherwise, delete it and rely on the reactive `key`.",
      delay: 63000,
    },
  ],
};

export default config;
