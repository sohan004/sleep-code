import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "react-native",
  project: "crewcall-mobile",
  branch: "feat/jobs-infinite-scroll",
  indent: "Spaces: 2",
  files: [
    "App.tsx",
    "package.json",
    "src/navigation/RootNavigator.tsx",
    "src/navigation/types.ts",
    "src/screens/JobListScreen.tsx",
    "src/screens/JobDetailScreen.tsx",
    "src/hooks/useJobs.ts",
    "src/hooks/__tests__/useJobs.test.tsx",
  ],
  snippets: [
    {
      filename: "src/screens/JobListScreen.tsx",
      syntax: "clike",
      languageLabel: "TypeScript JSX",
      code: `import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import { useJobs, type Job } from "../hooks/useJobs";

type Nav = NativeStackNavigationProp<RootStackParamList, "Jobs">;

const ROW_HEIGHT = 76;
interface JobRowProps {
  job: Job;
  onOpen: (id: string) => void;
}

const JobRow = React.memo(function JobRow({ job, onOpen }: JobRowProps) {
  const time = new Date(job.scheduledAt).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <Pressable
      onPress={() => onOpen(job.id)}
      accessibilityRole="button"
      accessibilityLabel={\`\${job.title} in \${job.suburb} at \${time}\`}
      accessibilityHint="Opens job details"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowText}>
        <Text style={styles.title} numberOfLines={1}>{job.title}</Text>
        <Text style={styles.meta}>{job.suburb} · {time}</Text>
      </View>
      <Text style={[styles.badge, styles[job.status]]}>{job.status.replace("_", " ")}</Text>
    </Pressable>
  );
});

export function JobListScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { jobs, loadMore, refresh, isLoading, isRefreshing, isFetchingMore, error } =
    useJobs();

  const openJob = useCallback(
    (id: string) => navigation.navigate("JobDetail", { jobId: id }),
    [navigation],
  );

  const renderItem = useCallback<ListRenderItem<Job>>(
    ({ item }) => <JobRow job={item} onOpen={openJob} />,
    [openJob],
  );

  if (isLoading) {
    return <ActivityIndicator style={{ flex: 1 }} accessibilityLabel="Loading jobs" />;
  }

  return (
    <FlatList
      data={jobs}
      keyExtractor={(job) => job.id}
      renderItem={renderItem}
      getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      windowSize={7}
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{error ? "Couldn't load jobs." : "No jobs today."}</Text>
      }
      ListFooterComponent={isFetchingMore ? <ActivityIndicator style={{ margin: 16 }} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  row: { height: ROW_HEIGHT, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 },
  rowPressed: { backgroundColor: "#f1f5f9" },
  rowText: { flex: 1, marginRight: 12 },
  title: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  meta: { fontSize: 13, color: "#475569", marginTop: 2 },
  badge: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  scheduled: { backgroundColor: "#e0f2fe", color: "#075985" },
  en_route: { backgroundColor: "#fef3c7", color: "#92400e" },
  on_site: { backgroundColor: "#dcfce7", color: "#166534" },
  complete: { backgroundColor: "#e2e8f0", color: "#334155" },
  empty: { textAlign: "center", marginTop: 48, color: "#64748b" },
});
`,
    },
    {
      filename: "src/hooks/useJobs.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { useCallback, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Config from "react-native-config";

export type JobStatus = "scheduled" | "en_route" | "on_site" | "complete";

export interface Job {
  id: string;
  title: string;
  suburb: string;
  status: JobStatus;
  scheduledAt: string;
}

interface JobPage {
  items: Job[];
  nextCursor: string | null;
}

const CACHE_KEY = "jobs:first-page";
const PAGE_SIZE = 30;

async function fetchJobPage(cursor: string | null, signal: AbortSignal): Promise<JobPage> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);

  // Base URL comes from .env via react-native-config, never hardcoded
  const res = await fetch(\`\${Config.API_BASE_URL}/v1/jobs?\${params.toString()}\`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(\`Jobs request failed with \${res.status}\`);
  }
  return (await res.json()) as JobPage;
}

async function loadCachedFirstPage(): Promise<JobPage | undefined> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  return raw ? (JSON.parse(raw) as JobPage) : undefined;
}

export function useJobs() {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ["jobs"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const { isConnected } = await NetInfo.fetch();
      if (!isConnected && pageParam === null) {
        const cached = await loadCachedFirstPage();
        if (cached) return cached;
      }
      const page = await fetchJobPage(pageParam, signal);
      if (pageParam === null) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(page));
      }
      return page;
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 60_000,
  });

  const { data, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = query;

  const jobs = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
    [queryClient],
  );

  return {
    jobs,
    loadMore,
    refresh,
    invalidate,
    isLoading: query.isPending,
    isRefreshing: query.isRefetching && !isFetchingNextPage,
    isFetchingMore: isFetchingNextPage,
    error: query.error,
  };
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "The job list stutters when a tech has 300+ jobs loaded. Anything obvious in JobListScreen?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "A few things are already in good shape: `JobRow` is wrapped in `React.memo`, `renderItem` is memoised, and `getItemLayout` lets `FlatList` skip measuring rows.\n\nThe likely culprits:\n1. **Date formatting per render** - `toLocaleTimeString` is relatively expensive on Hermes. Format `scheduledAt` once when the page arrives, or memoise it inside the row.\n2. **Inline `style` callback** on `Pressable` creates a new array each press; fine, but keep it out of hot paths.\n3. **`windowSize={7}`** is reasonable; you could also set `maxToRenderPerBatch={10}` and `removeClippedSubviews` on Android.\n\nIf it's still janky, profile with the React DevTools profiler and check whether `jobs` changes identity on every refetch.",
      delay: 11000,
    },
    {
      role: "user",
      content:
        "Does `jobs` change identity on every refetch? I'm using useMemo on `data`.",
      delay: 23000,
    },
    {
      role: "assistant",
      content:
        "Only when the data actually changes. TanStack Query uses **structural sharing** by default, so if a refetch returns identical JSON, `data` keeps the same reference and your `useMemo` returns the cached array.\n\nWhen one job's status changes, `data` gets a new reference and `flatMap` builds a new array, but unchanged `Job` objects keep their old references. Because `JobRow` is memoised and `openJob` is stable, only the changed row re-renders.\n\nOne caveat: structural sharing only works for JSON-serialisable data. If you ever map rows into class instances or add `Date` objects in `queryFn`, you lose it and every row re-renders.",
      delay: 33000,
    },
    {
      role: "user",
      content: "Offline handling - is caching only the first page enough for techs in dead zones?",
      delay: 45000,
    },
    {
      role: "assistant",
      content:
        "For a quick win it's fine, but it has gaps:\n1. `NetInfo.fetch()` reports `isConnected`, not reachability. On captive Wi-Fi it can be `true` while requests fail, so fall back to the cache in a `catch` as well.\n2. Later pages throw offline, which surfaces as an error even though page one is visible.\n\nA cleaner option is the query persister:\n```ts\npersistQueryClient({ queryClient, persister: createAsyncStoragePersister({ storage: AsyncStorage }) });\n```\nThen set `networkMode: \"offlineFirst\"` and wire `onlineManager` to NetInfo. Queries pause instead of failing, and the whole infinite list restores on cold start.",
      delay: 57000,
    },
  ],
};

export default config;
