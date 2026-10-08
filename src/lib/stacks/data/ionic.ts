import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "ionic",
  project: "physio-desk",
  branch: "feat/appointment-check-in",
  indent: "Spaces: 2",
  files: [
    "capacitor.config.ts",
    "src/main.ts",
    "src/app/app.routes.ts",
    "src/app/appointments/appointments.page.ts",
    "src/app/appointments/appointments.page.html",
    "src/app/appointments/appointments.page.scss",
    "src/app/appointments/appointment.service.ts",
    "src/app/appointments/appointment.service.spec.ts",
    "src/environments/environment.ts",
  ],
  snippets: [
    {
      filename: "src/app/appointments/appointments.page.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import {
  IonBadge,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
  RefresherCustomEvent,
  ToastController,
} from '@ionic/angular/standalone';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Appointment, AppointmentService } from './appointment.service';

@Component({
  selector: 'app-appointments',
  standalone: true,
  templateUrl: './appointments.page.html',
  styleUrls: ['./appointments.page.scss'],
  imports: [
    DatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
  ],
})
export class AppointmentsPage implements OnInit {
  private readonly service = inject(AppointmentService);
  private readonly toast = inject(ToastController);
  private readonly destroyRef = inject(DestroyRef);

  readonly appointments = signal<Appointment[]>([]);
  readonly loading = signal(true);
  readonly offline = signal(false);
  readonly upcoming = computed(() =>
    this.appointments()
      .filter((a) => a.status !== 'cancelled')
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  );

  ngOnInit(): void {
    this.service.networkStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((connected) => this.offline.set(!connected));
    void this.load();
  }

  async load(event?: RefresherCustomEvent): Promise<void> {
    try {
      this.appointments.set(await this.service.list());
    } catch {
      this.appointments.set(await this.service.cached());
      await this.showToast('Could not refresh. Showing your saved schedule.');
    } finally {
      this.loading.set(false);
      await event?.target.complete();
    }
  }

  async checkIn(appt: Appointment): Promise<void> {
    await Haptics.impact({ style: ImpactStyle.Light });
    const previous = this.appointments();
    this.appointments.update((list) =>
      list.map((a) => (a.id === appt.id ? { ...a, status: 'checked_in' as const } : a)),
    );
    try {
      await this.service.checkIn(appt.id);
    } catch {
      // Roll back the optimistic update so the list matches the server
      this.appointments.set(previous);
      await this.showToast('Check-in failed. Please try again.');
    }
  }

  ariaLabelFor(appt: Appointment): string {
    const time = new Date(appt.startsAt).toLocaleTimeString('en-AU', { timeStyle: 'short' });
    return appt.clientRef + ' with ' + appt.practitioner + ', room ' + appt.room + ', ' + time;
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toast.create({ message, duration: 2500, position: 'bottom' });
    await toast.present();
  }
}
`,
    },
    {
      filename: "src/app/appointments/appointment.service.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import { Injectable, NgZone, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom, timeout } from 'rxjs';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { PluginListenerHandle } from '@capacitor/core';
import { environment } from '../../environments/environment';

export type AppointmentStatus = 'booked' | 'checked_in' | 'completed' | 'cancelled';

export interface Appointment {
  id: string;
  clientRef: string;
  practitioner: string;
  room: string;
  startsAt: string;
  status: AppointmentStatus;
}

const CACHE_KEY = 'appointments.today';

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);
  private readonly baseUrl = environment.apiBaseUrl;

  readonly networkStatus$ = new Observable<boolean>((subscriber) => {
    let handle: PluginListenerHandle | undefined;
    void Network.getStatus().then((s) => subscriber.next(s.connected));
    void Network.addListener('networkStatusChange', (status) => {
      // Capacitor callbacks fire outside Angular's zone
      this.zone.run(() => subscriber.next(status.connected));
    }).then((h) => (handle = h));
    return () => void handle?.remove();
  });

  async list(date = new Date()): Promise<Appointment[]> {
    const params = new HttpParams().set('date', date.toISOString().slice(0, 10));
    const items = await firstValueFrom(
      this.http
        .get<Appointment[]>(this.baseUrl + '/appointments', { params })
        .pipe(timeout(8000)),
    );
    await Preferences.set({ key: CACHE_KEY, value: JSON.stringify(items) });
    return items;
  }

  async cached(): Promise<Appointment[]> {
    const { value } = await Preferences.get({ key: CACHE_KEY });
    return value ? (JSON.parse(value) as Appointment[]) : [];
  }

  async checkIn(id: string): Promise<void> {
    const url = this.baseUrl + '/appointments/' + encodeURIComponent(id) + '/check-in';
    await firstValueFrom(this.http.post<void>(url, {}).pipe(timeout(8000)));

    const current = await this.cached();
    const updated = current.map((a) =>
      a.id === id ? { ...a, status: 'checked_in' as const } : a,
    );
    await Preferences.set({ key: CACHE_KEY, value: JSON.stringify(updated) });
  }

  async clearCache(): Promise<void> {
    await Preferences.remove({ key: CACHE_KEY });
  }
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Is `networkStatus$` safe? I'm worried about leaking the Capacitor listener when the page is destroyed.",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Mostly, with one race. `takeUntilDestroyed` unsubscribes on destroy, which runs your teardown and calls `handle?.remove()`. But `addListener` is async: if the page is destroyed before the promise resolves, `handle` is still `undefined`, so nothing is removed and the listener lives forever.\n\nFix it by removing via the promise instead of a captured variable:\n```ts\nconst pending = Network.addListener('networkStatusChange', cb);\nreturn () => void pending.then((h) => h.remove());\n```\nThat covers both orderings. Also consider `shareReplay({ bufferSize: 1, refCount: true })` so multiple pages share one native listener.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Why do I need `zone.run` at all? We're on signals now.",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "It depends on whether the app is zoneless. If you bootstrap with `provideZonelessChangeDetection()`, signal writes schedule change detection themselves, so `zone.run` is redundant and you can drop the `NgZone` injection.\n\nIf you're still on Zone.js, Capacitor's bridge invokes listeners from a native callback that Zone.js doesn't patch. Since Angular 18 the hybrid scheduler still runs change detection for a signal write made outside the zone, but plain field updates or third-party callbacks in that path would be missed until the next tick. Keeping `zone.run` is cheap and makes the behaviour predictable.\n\nI'd check `main.ts` first; if you're zoneless, remove it in this service and the haptics path.",
      delay: 35000,
    },
    {
      role: "user",
      content: "How should I test the optimistic check-in rollback?",
      delay: 48000,
    },
    {
      role: "assistant",
      content:
        "Test the page with a stubbed service rather than hitting `HttpClient`:\n1. Provide a fake `AppointmentService` whose `checkIn` returns `Promise.reject(new Error())`.\n2. Mock `@capacitor/haptics` with `jest.mock` (or a Vitest alias) so `Haptics.impact` resolves.\n3. Seed `page.appointments.set([...])`, call `await page.checkIn(appt)`, and assert the status is back to `booked`.\n4. Spy on `ToastController.create` to confirm the error message.\n\nAdd a second test for the success path to assert the status stays `checked_in`. For the service itself, use `provideHttpClientTesting()` and `HttpTestingController` to verify the URL is encoded and the cache is updated.",
      delay: 60000,
    },
  ],
};

export default config;
