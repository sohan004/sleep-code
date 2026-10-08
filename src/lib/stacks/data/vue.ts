import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "vue",
  project: "studio-room-booker",
  branch: "feat/room-availability",
  indent: "Spaces: 2",
  files: [
    "src/main.ts",
    "src/App.vue",
    "src/router/index.ts",
    "src/stores/bookings.ts",
    "src/components/RoomAvailability.vue",
    "src/components/TimeSlotButton.vue",
    "src/types/booking.ts",
    "vite.config.ts",
    "package.json",
  ],
  snippets: [
    {
      filename: "src/components/RoomAvailability.vue",
      syntax: "clike",
      languageLabel: "Vue",
      code: `<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from "vue";
import { storeToRefs } from "pinia";
import { useBookingsStore } from "@/stores/bookings";
import TimeSlotButton from "./TimeSlotButton.vue";
import type { TimeSlot } from "@/types/booking";

const props = defineProps<{
  roomId: string;
  date: string;
}>();

const emit = defineEmits<{
  booked: [slot: TimeSlot];
}>();

const store = useBookingsStore();
const { slotsByRoom, isLoading, lastError } = storeToRefs(store);
const selectedId = ref<string | null>(null);
const notes = defineModel<string>("notes", { default: "" });
const notesId = useId();

const slots = computed(() => slotsByRoom.value[props.roomId] ?? []);
const freeCount = computed(() => slots.value.filter((s) => s.available).length);
const canSubmit = computed(
  () => selectedId.value !== null && notes.value.length <= 280 && !isLoading.value,
);

watch(
  () => [props.roomId, props.date] as const,
  ([roomId, date]) => store.loadSlots(roomId, date),
  { immediate: true },
);

onMounted(() => store.startPolling(props.roomId));

async function submit() {
  if (!canSubmit.value || !selectedId.value) return;
  const slot = await store.book(props.roomId, selectedId.value, notes.value.trim());
  if (slot) {
    emit("booked", slot);
    selectedId.value = null;
  }
}
</script>

<template>
  <section class="availability" aria-labelledby="availability-heading">
    <h2 id="availability-heading">Available times</h2>
    <p role="status" aria-live="polite">{{ freeCount }} slots free on {{ date }}</p>

    <p v-if="lastError" role="alert" class="error">{{ lastError }}</p>

    <form @submit.prevent="submit">
      <fieldset :disabled="isLoading">
        <legend>Choose a time</legend>
        <div class="slot-grid" role="radiogroup">
          <TimeSlotButton
            v-for="slot in slots"
            :key="slot.id"
            :slot="slot"
            :selected="slot.id === selectedId"
            @select="selectedId = slot.id"
          />
        </div>
      </fieldset>

      <label :for="notesId">Notes for the studio (optional)</label>
      <textarea :id="notesId" v-model="notes" maxlength="280" rows="3" />
      <small>{{ notes.length }}/280</small>

      <button type="submit" :disabled="!canSubmit">Book this slot</button>
    </form>
  </section>
</template>

<style scoped>
.slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: 0.5rem;
}
</style>`,
    },
    {
      filename: "src/stores/bookings.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import type { TimeSlot } from "@/types/booking";

const API_URL = import.meta.env.VITE_BOOKING_API_URL;
const POLL_MS = 45_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_URL + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error("Request failed with status " + res.status);
  return res.json() as Promise<T>;
}

export const useBookingsStore = defineStore("bookings", () => {
  const slotsByRoom = shallowRef<Record<string, TimeSlot[]>>({});
  const isLoading = ref(false);
  const lastError = ref<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let activeDate = "";

  async function loadSlots(roomId: string, date: string) {
    activeDate = date;
    isLoading.value = true;
    lastError.value = null;
    try {
      const query = new URLSearchParams({ date });
      const slots = await request<TimeSlot[]>("/rooms/" + roomId + "/slots?" + query);
      // Replace the object so shallowRef triggers dependents
      slotsByRoom.value = { ...slotsByRoom.value, [roomId]: slots };
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : "Unknown error";
    } finally {
      isLoading.value = false;
    }
  }

  async function book(roomId: string, slotId: string, notes: string) {
    isLoading.value = true;
    try {
      const slot = await request<TimeSlot>("/rooms/" + roomId + "/bookings", {
        method: "POST",
        body: JSON.stringify({ slotId, notes }),
      });
      const updated = (slotsByRoom.value[roomId] ?? []).map((s) =>
        s.id === slotId ? { ...s, available: false } : s,
      );
      slotsByRoom.value = { ...slotsByRoom.value, [roomId]: updated };
      return slot;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : "Booking failed";
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  function startPolling(roomId: string) {
    stopPolling();
    pollTimer = setInterval(() => {
      if (document.visibilityState === "visible") void loadSlots(roomId, activeDate);
    }, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = undefined;
  }

  return { slotsByRoom, isLoading, lastError, loadSlots, book, startPolling, stopPolling };
});`,
    },
  ],
  chat: [
    {
      role: "user",
      content: "Why did you use shallowRef for slotsByRoom instead of ref?",
      delay: 3000,
    },
    {
      role: "assistant",
      content: "Each room can return a few hundred slot objects, and `ref` would wrap every one of them in a deep reactive proxy. We never mutate individual slots in place; we always replace the array, so deep tracking is wasted work.\n\nWith `shallowRef`, only `.value` assignment triggers updates. That is why `loadSlots` and `book` build a new object with the spread operator. If someone later writes `slotsByRoom.value[roomId].push(...)`, the UI will **not** update, so it is worth a comment or a lint rule to protect that convention.",
      delay: 12500,
    },
    {
      role: "user",
      content: "The polling keeps running after I navigate away from the page.",
      delay: 26000,
    },
    {
      role: "assistant",
      content: "Right, the component calls `startPolling` in `onMounted` but never stops it. Because Pinia stores outlive components, the interval keeps firing. Add the matching cleanup:\n\n```ts\nonUnmounted(() => store.stopPolling());\n```\n\nAlso note the `watch` reloads when `roomId` changes, but polling is still bound to the original room. Move `startPolling` into the watch callback so it restarts with the new room, and drop the `onMounted` call entirely.",
      delay: 37000,
    },
    {
      role: "user",
      content: "How should I test the booking flow?",
      delay: 50000,
    },
    {
      role: "assistant",
      content: "I would split it into two layers:\n\n1. **Store tests** with Vitest: call `setActivePinia(createPinia())`, stub `fetch` with `vi.fn()`, and assert that `book` marks the slot unavailable and sets `lastError` on a 409.\n2. **Component tests** with `@vue/test-utils` and `createTestingPinia`: mount `RoomAvailability`, select a slot, submit, and check the `booked` event was emitted.\n\nFor the component, query by accessible role and label rather than CSS classes. That keeps tests stable and verifies the labels actually work.",
      delay: 61000,
    },
  ],
};

export default config;
