import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "angular",
  project: "warehouse-stock-portal",
  branch: "feat/low-stock-panel",
  indent: "Spaces: 2",
  files: [
    "src/main.ts",
    "src/app/app.config.ts",
    "src/app/app.routes.ts",
    "src/app/stock/stock.service.ts",
    "src/app/stock/low-stock-panel.component.ts",
    "src/app/stock/low-stock-panel.component.html",
    "src/app/stock/stock.model.ts",
    "src/environments/environment.ts",
    "angular.json",
  ],
  snippets: [
    {
      filename: "src/app/stock/low-stock-panel.component.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { DecimalPipe } from "@angular/common";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { StockService } from "./stock.service";
import type { StockItem } from "./stock.model";

type SortMode = "shortfall" | "sku";

@Component({
  selector: "app-low-stock-panel",
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: "./low-stock-panel.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LowStockPanelComponent {
  private readonly stock = inject(StockService);
  private readonly destroyRef = inject(DestroyRef);

  readonly warehouseId = input.required<string>();
  readonly threshold = input(10);
  readonly reorderRequested = output<StockItem>();

  readonly sortMode = signal<SortMode>("shortfall");
  readonly pendingSku = signal<string | null>(null);

  readonly quantity = new FormControl(50, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(1), Validators.max(5000)],
  });

  readonly items = this.stock.itemsFor(this.warehouseId);
  readonly isLoading = this.stock.isLoading;

  readonly lowStock = computed(() => {
    const limit = this.threshold();
    const list = this.items().filter((item) => item.onHand < limit);
    return this.sortMode() === "sku"
      ? list.toSorted((a, b) => a.sku.localeCompare(b.sku))
      : list.toSorted((a, b) => a.onHand - a.reorderPoint - (b.onHand - b.reorderPoint));
  });

  readonly summary = computed(() => {
    const count = this.lowStock().length;
    return count === 1 ? "1 item below threshold" : count + " items below threshold";
  });

  toggleSort(): void {
    this.sortMode.update((mode) => (mode === "shortfall" ? "sku" : "shortfall"));
  }

  reorder(item: StockItem): void {
    if (this.quantity.invalid || this.pendingSku()) return;
    this.pendingSku.set(item.sku);

    this.stock
      .createReorder(this.warehouseId(), item.sku, this.quantity.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reorderRequested.emit(item),
        error: () => this.pendingSku.set(null),
        complete: () => this.pendingSku.set(null),
      });
  }

  trackSku(_index: number, item: StockItem): string {
    return item.sku;
  }
}`,
    },
    {
      filename: "src/app/stock/low-stock-panel.component.html",
      syntax: "markup",
      languageLabel: "HTML",
      code: `<!-- Low stock panel: lists SKUs below the configured threshold -->
<section class="panel" aria-labelledby="low-stock-heading">
  <header class="panel__header">
    <h2 id="low-stock-heading">Low stock</h2>
    <p class="panel__summary" role="status" aria-live="polite">{{ summary() }}</p>
    <button
      type="button"
      class="button button--ghost"
      [attr.aria-pressed]="sortMode() === 'sku'"
      (click)="toggleSort()"
    >
      Sort by {{ sortMode() === 'sku' ? 'shortfall' : 'SKU' }}
    </button>
  </header>

  <div class="panel__controls">
    <label for="reorder-qty">Reorder quantity</label>
    <input
      id="reorder-qty"
      type="number"
      inputmode="numeric"
      min="1"
      max="5000"
      [formControl]="quantity"
      [attr.aria-invalid]="quantity.invalid"
      aria-describedby="reorder-qty-hint"
    />
    <p id="reorder-qty-hint" class="hint">Between 1 and 5,000 units.</p>
  </div>

  @if (isLoading()) {
    <p role="status">Loading stock levels...</p>
  } @else {
    <table class="stock-table">
      <caption class="visually-hidden">Items below {{ threshold() }} units</caption>
      <thead>
        <tr>
          <th scope="col">SKU</th>
          <th scope="col">Description</th>
          <th scope="col">On hand</th>
          <th scope="col">Reorder point</th>
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        @for (item of lowStock(); track item.sku) {
          <tr [class.is-critical]="item.onHand === 0">
            <th scope="row">{{ item.sku }}</th>
            <td>{{ item.description }}</td>
            <td>{{ item.onHand | number }}</td>
            <td>{{ item.reorderPoint | number }}</td>
            <td>
              <button
                type="button"
                class="button"
                [disabled]="quantity.invalid || pendingSku() !== null"
                [attr.aria-busy]="pendingSku() === item.sku"
                (click)="reorder(item)"
              >
                Reorder <span class="visually-hidden">{{ item.description }}</span>
              </button>
            </td>
          </tr>
        } @empty {
          <tr>
            <td colspan="5">All items are above the threshold.</td>
          </tr>
        }
      </tbody>
    </table>
  }
</section>`,
    },
  ],
  chat: [
    {
      role: "user",
      content: "Do I still need trackSku now that the template uses @for with track item.sku?",
      delay: 3000,
    },
    {
      role: "assistant",
      content: "No. `trackSku` was for the old `*ngFor` with `trackBy`. The built-in `@for` block requires a `track` expression and `track item.sku` does the same job inline, so you can delete the method.\n\nKeep tracking by a stable identity like the SKU rather than `$index`. With `$index`, re-sorting the list would make Angular reuse DOM rows for different items, which can move focus unexpectedly for keyboard users and break the `aria-busy` state on the wrong button.",
      delay: 11500,
    },
    {
      role: "user",
      content: "Is OnPush still worth setting if everything is signals?",
      delay: 24000,
    },
    {
      role: "assistant",
      content: "Yes. With `OnPush`, Angular only checks this component when an input changes, an event fires in it, or a signal read in its template changes. Without it, the component is checked on every application-wide change detection pass, even though nothing it reads has changed.\n\nIt is also the stepping stone to **zoneless** change detection. If you later add `provideZonelessChangeDetection()` in `app.config.ts`, components that already rely on signals and `OnPush` generally work without changes.",
      delay: 35000,
    },
    {
      role: "user",
      content: "If the reorder request errors, the user gets no feedback. What would you add?",
      delay: 49000,
    },
    {
      role: "assistant",
      content: "Add an error signal and surface it in a live region:\n\n1. `readonly reorderError = signal<string | null>(null);`\n2. In `error`, set a short, human message rather than the raw `HttpErrorResponse` text, which can leak server details.\n3. Clear it at the start of `reorder()`.\n4. In the template, render `@if (reorderError()) { <p role=\"alert\">...</p> }`.\n\n`role=\"alert\"` is assertive, which suits a failed action the user just triggered. Also add a unit test with `HttpTestingController` that flushes a 500 and asserts the message appears.",
      delay: 61000,
    },
  ],
};

export default config;
