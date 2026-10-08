import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "expo",
  project: "pantry-pal",
  branch: "feat/recipe-search",
  indent: "Spaces: 2",
  files: [
    "app.config.ts",
    "app/_layout.tsx",
    "app/(tabs)/_layout.tsx",
    "app/(tabs)/recipes/index.tsx",
    "app/(tabs)/recipes/[id].tsx",
    "hooks/useRecipeSearch.ts",
    "hooks/__tests__/useRecipeSearch.test.ts",
    "eas.json",
  ],
  snippets: [
    {
      filename: "app/(tabs)/recipes/index.tsx",
      syntax: "clike",
      languageLabel: "TypeScript JSX",
      code: `import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, Stack } from "expo-router";
import { Image } from "expo-image";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";

import { useRecipeSearch, type RecipeSummary } from "@/hooks/useRecipeSearch";

function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  return (
    <Link href={{ pathname: "/recipes/[id]", params: { id: recipe.id } }} asChild>
      <Pressable
        style={styles.card}
        accessibilityRole="link"
        accessibilityLabel={\`\${recipe.title}, \${recipe.minutes} minutes, serves \${recipe.serves}\`}
        onPressIn={() => void Haptics.selectionAsync()}
      >
        <Image
          source={{ uri: recipe.imageUrl }}
          style={styles.thumb}
          contentFit="cover"
          transition={150}
          recyclingKey={recipe.id}
          accessibilityIgnoresInvertColors
        />
        <View style={styles.cardBody}>
          <Text style={styles.title} numberOfLines={2}>{recipe.title}</Text>
          <Text style={styles.meta}>
            {recipe.minutes} min · serves {recipe.serves}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

export default function RecipesScreen() {
  const [query, setQuery] = useState("");
  const { recipes, status, loadMore, retry } = useRecipeSearch(query);

  const renderItem = useCallback<ListRenderItem<RecipeSummary>>(
    ({ item }) => <RecipeCard recipe={item} />,
    [],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <Stack.Screen options={{ title: "Recipes", headerLargeTitle: true }} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search recipes or ingredients"
        accessibilityLabel="Search recipes"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={styles.search}
      />
      {status === "error" ? (
        <Pressable onPress={retry} accessibilityRole="button" style={styles.retry}>
          <Text>Couldn't load recipes. Tap to retry.</Text>
        </Pressable>
      ) : null}
      <FlashList
        data={recipes}
        renderItem={renderItem}
        keyExtractor={(r) => r.id}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          status === "idle" ? <Text style={styles.empty}>No recipes match.</Text> : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fafaf9" },
  search: { margin: 16, padding: 12, borderRadius: 12, backgroundColor: "#e7e5e4", fontSize: 16 },
  retry: { marginHorizontal: 16, padding: 12, borderRadius: 8, backgroundColor: "#fee2e2" },
  card: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: "#d6d3d1" },
  cardBody: { flex: 1, justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "600", color: "#1c1917" },
  meta: { fontSize: 13, color: "#57534e", marginTop: 4 },
  empty: { textAlign: "center", marginTop: 48, color: "#78716c" },
});
`,
    },
    {
      filename: "hooks/useRecipeSearch.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { useCallback, useEffect, useRef, useState } from "react";
import Storage from "expo-sqlite/kv-store";

export interface RecipeSummary {
  id: string;
  title: string;
  minutes: number;
  serves: number;
  imageUrl: string;
}

type Status = "idle" | "loading" | "error";

// Public base URL only; inlined at build time from .env by Expo
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

async function fetchRecipes(q: string, page: number, signal: AbortSignal) {
  const qs = new URLSearchParams({ q, page: String(page), limit: String(PAGE_SIZE) });
  const res = await fetch(\`\${API_URL}/recipes?\${qs.toString()}\`, { signal });
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return (await res.json()) as { items: RecipeSummary[]; hasMore: boolean };
}

export function useRecipeSearch(query: string) {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [attempt, setAttempt] = useState(0);
  const page = useRef(1);
  const hasMore = useRef(true);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = query.trim();
    const cacheKey = \`recipes:\${term.toLowerCase()}\`;
    const timer = setTimeout(async () => {
      controller.current?.abort();
      const ac = new AbortController();
      controller.current = ac;
      page.current = 1;
      setStatus("loading");

      const cached = await Storage.getItem(cacheKey);
      if (cached && !ac.signal.aborted) setRecipes(JSON.parse(cached));

      try {
        const result = await fetchRecipes(term, 1, ac.signal);
        hasMore.current = result.hasMore;
        setRecipes(result.items);
        setStatus("idle");
        await Storage.setItem(cacheKey, JSON.stringify(result.items));
      } catch {
        if (!ac.signal.aborted) setStatus(cached ? "idle" : "error");
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.current?.abort();
    };
  }, [query, attempt]);

  const loadMore = useCallback(async () => {
    if (status !== "idle" || !hasMore.current) return;
    const ac = new AbortController();
    controller.current = ac;
    setStatus("loading");
    try {
      const next = page.current + 1;
      const result = await fetchRecipes(query.trim(), next, ac.signal);
      page.current = next;
      hasMore.current = result.hasMore;
      setRecipes((prev) => [...prev, ...result.items]);
      setStatus("idle");
    } catch {
      if (!ac.signal.aborted) setStatus("error");
    }
  }, [query, status]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { recipes, status, loadMore, retry };
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "We moved from FlatList to FlashList v2. Do I still need `estimatedItemSize` on the recipe list?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "No. FlashList v2 is built for the New Architecture and measures items synchronously, so `estimatedItemSize` (and `estimatedListSize`) were removed. Passing it now just triggers a warning.\n\nA few v2 notes for this screen:\n1. Keep `keyExtractor` - v2 uses it for recycling and layout correctness.\n2. `recyclingKey` on the `expo-image` component is the right call; without it a recycled cell can briefly show the previous recipe's photo.\n3. If you add section headers later, use `getItemType` so headers and cards recycle from separate pools.\n\nSDK 53+ enables the New Architecture by default, so you're fine there.",
      delay: 11000,
    },
    {
      role: "user",
      content: "Is there a race in useRecipeSearch between typing and loadMore?",
      delay: 23000,
    },
    {
      role: "assistant",
      content:
        "Yes, a small one. During the 300 ms debounce window, `query` has already changed but `recipes` and `page.current` still belong to the old term. If `onEndReached` fires then, `loadMore` requests page 2 of the **new** term and appends it to page 1 of the old one. It also overwrites `controller.current` without aborting the previous controller.\n\nTwo fixes:\n1. Guard on `status === \"idle\"` (already there) and also bail if `query.trim()` differs from the term the first page was loaded for. Store that term in a ref.\n2. Abort `controller.current` at the start of `loadMore` so only one request is ever in flight.",
      delay: 35000,
    },
    {
      role: "user",
      content: "Should I just swap this for TanStack Query?",
      delay: 47000,
    },
    {
      role: "assistant",
      content:
        "For this hook, probably yes. `useInfiniteQuery` with `queryKey: [\"recipes\", term]` gives you per-term caching, request cancellation through the `signal` argument, and page tracking without refs. You'd keep the debounce outside in a small custom hook:\n```ts\nconst term = useDebouncedValue(query.trim(), 300);\n```\nFor offline, the kv-store cache maps onto a query persister, or you can keep `Storage` and seed `initialData`.\n\nThe main reason to keep the hand-rolled version is bundle size, but TanStack Query is small relative to `expo-image` and FlashList. The bigger win is testability: you can render the hook with a fresh `QueryClient` per test and mock `fetch`.",
      delay: 58000,
    },
  ],
};

export default config;
