import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "react",
  project: "fleet-telemetry-console",
  branch: "feat/vehicle-health-table",
  indent: "Spaces: 2",
  files: [
    "src/main.tsx",
    "src/App.tsx",
    "src/api/client.ts",
    "src/hooks/useVehicleHealth.ts",
    "src/components/VehicleHealthTable.tsx",
    "src/components/StatusPill.tsx",
    "src/types/vehicle.ts",
    "vite.config.ts",
    "package.json",
  ],
  snippets: [
    {
      filename: "src/components/VehicleHealthTable.tsx",
      syntax: "clike",
      languageLabel: "TypeScript JSX",
      code: `import { useDeferredValue, useId, useMemo, useState } from "react";
import { useVehicleHealth, useAcknowledgeAlert } from "../hooks/useVehicleHealth";
import { StatusPill } from "./StatusPill";
import type { VehicleHealth } from "../types/vehicle";

type SortKey = "name" | "batteryPct" | "lastSeen";

interface VehicleHealthTableProps {
  depotId: string;
}

const collator = new Intl.Collator("en-AU", { sensitivity: "base" });

export function VehicleHealthTable({ depotId }: VehicleHealthTableProps) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("batteryPct");
  const deferredQuery = useDeferredValue(query);
  const { data, isPending, isError, error } = useVehicleHealth(depotId);
  const acknowledge = useAcknowledgeAlert(depotId);

  const rows = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const filtered = (data ?? []).filter((v) => v.name.toLowerCase().includes(needle));
    return filtered.toSorted((a, b) => compare(a, b, sortKey));
  }, [data, deferredQuery, sortKey]);

  if (isPending) return <p role="status">Loading vehicles...</p>;
  if (isError) return <p role="alert">Could not load vehicles: {error.message}</p>;

  return (
    <section aria-labelledby="fleet-heading">
      <h2 id="fleet-heading">Vehicle health</h2>
      <label htmlFor={searchId}>Filter by name</label>
      <input
        id={searchId}
        type="search"
        value={query}
        maxLength={64}
        onChange={(e) => setQuery(e.target.value)}
      />
      <table aria-busy={query !== deferredQuery}>
        <thead>
          <tr>
            <SortHeader label="Vehicle" field="name" active={sortKey} onSort={setSortKey} />
            <SortHeader label="Battery" field="batteryPct" active={sortKey} onSort={setSortKey} />
            <SortHeader label="Last seen" field="lastSeen" active={sortKey} onSort={setSortKey} />
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id}>
              <th scope="row">{v.name}</th>
              <td>{v.batteryPct}%</td>
              <td>{new Date(v.lastSeen).toLocaleTimeString("en-AU")}</td>
              <td>
                <StatusPill status={v.status} />
                {v.openAlertId && (
                  <button
                    type="button"
                    disabled={acknowledge.isPending}
                    onClick={() => acknowledge.mutate(v.openAlertId!)}
                  >
                    Acknowledge
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SortHeader(props: {
  label: string;
  field: SortKey;
  active: SortKey;
  onSort: (key: SortKey) => void;
}) {
  const isActive = props.active === props.field;
  return (
    <th scope="col" aria-sort={isActive ? "ascending" : "none"}>
      <button type="button" onClick={() => props.onSort(props.field)}>
        {props.label}
      </button>
    </th>
  );
}

function compare(a: VehicleHealth, b: VehicleHealth, key: SortKey): number {
  if (key === "name") return collator.compare(a.name, b.name);
  return a[key] - b[key];
}`,
    },
    {
      filename: "src/hooks/useVehicleHealth.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { VehicleHealth } from "../types/vehicle";

const API_BASE = import.meta.env.VITE_TELEMETRY_API_URL;

export const vehicleKeys = {
  all: ["vehicles"] as const,
  depot: (depotId: string) => [...vehicleKeys.all, "depot", depotId] as const,
};

export function vehicleHealthOptions(depotId: string) {
  return queryOptions({
    queryKey: vehicleKeys.depot(depotId),
    queryFn: ({ signal }) =>
      apiFetch<VehicleHealth[]>(API_BASE + "/depots/" + encodeURIComponent(depotId) + "/health", {
        signal,
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useVehicleHealth(depotId: string) {
  return useQuery(vehicleHealthOptions(depotId));
}

export function useAcknowledgeAlert(depotId: string) {
  const queryClient = useQueryClient();
  const key = vehicleKeys.depot(depotId);

  return useMutation({
    mutationFn: (alertId: string) =>
      apiFetch<void>(API_BASE + "/alerts/" + encodeURIComponent(alertId) + "/ack", {
        method: "POST",
      }),

    // Optimistically clear the alert so the button disappears immediately
    onMutate: async (alertId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<VehicleHealth[]>(key);

      queryClient.setQueryData<VehicleHealth[]>(key, (old) =>
        old?.map((v) => (v.openAlertId === alertId ? { ...v, openAlertId: null } : v)),
      );

      return { previous };
    },

    onError: (_err, _alertId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function prefetchDepot(depotId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.prefetchQuery(vehicleHealthOptions(depotId));
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content: "Typing in the filter box feels laggy with ~2,000 vehicles. Is useDeferredValue actually doing anything here?",
      delay: 3000,
    },
    {
      role: "assistant",
      content: "Yes, but only half the job. `useDeferredValue` lets React render the input update first and the filtered list in a lower-priority pass, which keeps keystrokes responsive. Two things limit it right now:\n\n1. Every `<tr>` re-renders on each pass. Extract the row into a `memo`-wrapped `VehicleRow` component so unchanged rows are skipped.\n2. 2,000 DOM rows is a lot regardless. A virtualiser such as `@tanstack/react-virtual` would only render the visible 30 or so.\n\nIf you enable the **React Compiler**, it will handle most of the memoisation for you, including the `useMemo` you wrote by hand.",
      delay: 12000,
    },
    {
      role: "user",
      content: "The optimistic update on acknowledge flickers back sometimes. Why?",
      delay: 25000,
    },
    {
      role: "assistant",
      content: "That is the 60-second `refetchInterval` racing the mutation. If a background refetch was already in flight, it can resolve after your `setQueryData` and overwrite it with the stale server state.\n\nYou already call `cancelQueries` in `onMutate`, which handles in-flight fetches at that moment. The remaining gap is a new interval fetch starting before the POST completes. Setting a short `staleTime` does not help there. Instead, check `queryClient.isMutating()` in a `refetchInterval` function:\n\n```ts\nrefetchInterval: () => (queryClient.isMutating() ? false : 60_000)\n```",
      delay: 37000,
    },
    {
      role: "user",
      content: "Also, prefetchDepot calls useQueryClient inside a normal function. Is that OK?",
      delay: 51000,
    },
    {
      role: "assistant",
      content: "Good catch, it is not. `useQueryClient` is a hook, so calling it inside `prefetchDepot` breaks the **Rules of Hooks** unless that function is only ever called during render, and the ESLint plugin will flag it because the name does not start with `use`.\n\nRename it to `usePrefetchDepot`, call it at the top of the component, and return the callback. Then wire it to `onPointerEnter` and `onFocus` on the depot link so keyboard users get the prefetch too.",
      delay: 62000,
    },
  ],
};

export default config;
