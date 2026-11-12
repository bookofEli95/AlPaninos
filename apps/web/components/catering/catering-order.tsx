"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, Check, Plus, Star, Trash2, Users } from "lucide-react";
import Checkout from "@/components/checkout/checkout";
import ChoiceGroups from "@/components/ordering/choice-groups";
import JumpLink from "@/components/jump-link";
import PeopleInput from "@/components/ordering/people-input";
import { cartTotals, cateringCart, useHydrated, type CartLine, type CartState } from "@/lib/cart";
import {
  cartOptions,
  changeChoiceCount,
  defaultSelections,
  missingGroup,
  priceWithChoices,
  selectionsFromOptions,
  toggleChoice,
  visibleGroups,
  type ChoiceGroup,
  type Selections,
} from "@/lib/ordering/choices";
import type { CateringPackage } from "@/lib/catering-menu";
import type { Store } from "@/lib/menu";
import { money, tidyDescription } from "@/lib/format";

// The catering form: pick a package (or two), how many people and the
// choices, then the same checkout as everywhere else, all on one page. The
// order is kept apart from the everyday cart (cateringCart) and is
// remembered in this browser until it's sent.

const DEFAULT_PEOPLE = 10;
// (The name before and after the "Al Panino's" rename, so the badge stays
// put whichever is in the database.)
const MOST_POPULAR = ["Al Panino's Classic Luncheon", "Al's Classic Luncheon"];

function lineFor(pkg: CateringPackage, people: number, selections: Selections = defaultSelections(pkg.groups)): Omit<CartLine, "lineId"> {
  const shown = visibleGroups(pkg.groups, selections);
  return {
    menuItemId: pkg.id,
    name: pkg.name,
    categoryId: pkg.category_id,
    categoryName: pkg.category_name,
    imageUrl: pkg.image_url,
    isCatering: true,
    perPerson: true,
    options: cartOptions(shown, selections),
    unitPrice: priceWithChoices(pkg.base_price, shown, selections),
    quantity: people,
  };
}

const storeName = (stores: Store[], id: string) => stores.find((s) => s.id === id)?.name ?? "";

// The order's store: what it's already for, otherwise the page's.
function useOrderStore(stores: Store[], initialStoreId: string) {
  const c = cateringCart.useOrder();
  const hydrated = useHydrated();
  const storeId = hydrated && c.storeId && stores.some((s) => s.id === c.storeId) ? c.storeId : initialStoreId;
  useEffect(() => {
    if (!hydrated) return;
    if (!c.storeId || !stores.some((s) => s.id === c.storeId)) cateringCart.cart.reset({ storeId: initialStoreId, storeName: storeName(stores, initialStoreId), lines: [] });
  }, [hydrated, c.storeId, stores, initialStoreId]);
  return { c, storeId, hydrated };
}

function scrollToOrder() {
  document.getElementById("spread")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Picking a package from its card: the one in the order becomes this one
// (same headcount), or it starts the order.
function choosePackage(c: CartState, pkg: CateringPackage, stores: Store[]) {
  const { cart } = cateringCart;
  if (c.lines.length === 1) {
    const [only] = c.lines;
    if (only.menuItemId !== pkg.id) cart.replace(only.lineId, lineFor(pkg, only.quantity));
  } else if (c.lines.length === 0 || !c.lines.some((l) => l.menuItemId === pkg.id)) {
    cart.append(lineFor(pkg, DEFAULT_PEOPLE), { id: pkg.location_id, name: storeName(stores, pkg.location_id) });
  }
  scrollToOrder();
}

// ---- The package cards ------------------------------------------------------

// "You choose: Salad · Dessert · Your favourite sandwiches" -- the choices
// shown when the package opens (add-ons are in every package, so left out).
function choiceSummary(pkg: CateringPackage): string[] {
  return visibleGroups(pkg.groups, defaultSelections(pkg.groups))
    .filter((g) => !/add-ons/i.test(g.name))
    .map((g) =>
      /^package$/i.test(g.name) ? "The full spread or sandwiches only" : /favourites/i.test(g.name) ? "Your favourite sandwiches" : g.name.replace(/\s*\(.*\)$/, "")
    );
}

export function PackageCards({ packages, stores, initialStoreId, customPhone }: { packages: CateringPackage[]; stores: Store[]; initialStoreId: string; customPhone: string | null }) {
  const { c, storeId } = useOrderStore(stores, initialStoreId);
  const here = packages.filter((p) => p.location_id === storeId);
  const inOrder = new Set(c.lines.map((l) => l.menuItemId));
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {here.map((pkg, i) => {
        const popular = MOST_POPULAR.includes(pkg.name);
        const picked = inOrder.has(pkg.id);
        const choices = choiceSummary(pkg);
        return (
          <li key={pkg.id} className={`relative flex flex-col rounded-2xl bg-white p-6 ring-1 ${popular ? "ring-2 ring-brand" : "ring-stone-200"}`}>
            {popular && (
              <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-md shadow-brand/30">
                <Star className="size-3 fill-current" aria-hidden />
                Most popular
              </span>
            )}
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-stone-500">Spread {String.fromCharCode(65 + i)}</p>
            <h3 className="mt-1.5 font-display text-2xl font-extrabold leading-tight text-ink">{pkg.name}</h3>
            <p className="mt-2 font-display text-3xl font-extrabold tabular-nums text-brand">
              {money(pkg.base_price)}
              <span className="ml-1 text-[15px] font-bold text-stone-500">/ person</span>
            </p>
            {pkg.description && <p className="mt-3 flex-1 text-[14px] leading-6 text-stone-600">{tidyDescription(pkg.description)}</p>}
            {choices.length > 0 && (
              <p className="mt-3 text-[13px] text-stone-500">
                <span className="font-bold text-ink">You choose:</span> {choices.join(" · ")}
              </p>
            )}
            <button
              type="button"
              onClick={() => choosePackage(cateringCart.get(), pkg, stores)}
              className={`mt-5 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3.5 text-[14px] font-extrabold uppercase tracking-wide transition-colors ${
                picked ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : popular ? "bg-brand text-white hover:bg-brand-dark" : "bg-ink text-white hover:bg-black"
              }`}
            >
              {picked ? (
                <>
                  <Check className="size-4" aria-hidden />
                  In your order
                </>
              ) : (
                "Choose this spread"
              )}
            </button>
          </li>
        );
      })}
      <li className="grain relative flex flex-col overflow-hidden rounded-2xl bg-ink p-6 text-white sm:col-span-2 lg:col-span-3 lg:flex-row lg:items-center lg:gap-12 lg:p-8">
        <div className="flex-1">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-gold">Fully custom</p>
          <h3 className="mt-1.5 font-display text-2xl font-extrabold leading-tight sm:text-3xl">Al Panino&apos;s Makes It Your Way</h3>
          <p className="mt-3 max-w-2xl text-[15px] leading-6 text-stone-300">
            Got something else in mind? A bigger crowd, a different menu, gluten-free for everyone? Tell Al Panino&apos;s what you&apos;re dreaming up and we&apos;ll build it. Needs 48 hours&apos; notice.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2.5 lg:mt-0 lg:shrink-0">
          <a href="/support?topic=Catering" className="inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-gold px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-ink hover:bg-white lg:flex-none">
            Ask Al Panino&apos;s
          </a>
          {customPhone && (
            <a
              href={`tel:${customPhone.replace(/[^\d+]/g, "")}`}
              className="inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-lg px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white ring-1 ring-white/30 hover:bg-white/10 lg:flex-none"
            >
              Call {customPhone}
            </a>
          )}
        </div>
      </li>
    </ul>
  );
}

// ---- One package in the order ---------------------------------------------

const selectClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] font-bold text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/10";
const fieldLabel = "text-xs font-bold uppercase tracking-wide text-stone-500";

function PackageSelect({ id, label, value, packages, onPick }: { id: string; label: string; value: string; packages: CateringPackage[]; onPick: (pkg: CateringPackage) => void }) {
  return (
    <label htmlFor={id} className="block">
      <span className={fieldLabel}>{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const next = packages.find((p) => p.id === e.target.value);
          if (next) onPick(next);
        }}
        className={selectClass}
      >
        {!value && (
          <option value="" disabled>
            Choose a package
          </option>
        )}
        {packages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {money(p.base_price)}/pp
          </option>
        ))}
      </select>
    </label>
  );
}

function PackageLine({
  line,
  pkg,
  packages,
  showErrors,
  plain,
}: {
  line: CartLine;
  pkg: CateringPackage;
  packages: CateringPackage[];
  showErrors: boolean;
  // The only package: straight in the form, no box around it.
  plain: boolean;
}) {
  const { cart } = cateringCart;
  const selections = useMemo(() => selectionsFromOptions(pkg.groups, line.options), [pkg, line.options]);
  const shown = visibleGroups(pkg.groups, selections);
  // The package's own "Package" choice (full spread or sandwiches only) reads
  // as what's included, next to the "Package selection" above it.
  const labelled = shown.map((g) => (/^package$/i.test(g.name) ? { ...g, name: "What's included" } : g));
  const update = (next: Selections, people = line.quantity) => cart.replace(line.lineId, lineFor(pkg, people, next));
  const onToggle = (group: ChoiceGroup, optionId: string) => update(toggleChoice(pkg.groups, selections, group, optionId));
  const onCount = (group: ChoiceGroup, optionId: string, delta: 1 | -1) => update(changeChoiceCount(selections, group, optionId, delta));

  return (
    <div className={plain ? "" : "rounded-xl p-4 ring-1 ring-stone-200 sm:p-5"}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <PackageSelect id={`package-${line.lineId}`} label="Package selection" value={pkg.id} packages={packages} onPick={(next) => cart.replace(line.lineId, lineFor(next, line.quantity))} />
        <PeopleInput id={`people-${line.lineId}`} stacked label="Number of people" value={line.quantity} onChange={(n) => cart.setQuantity(line.lineId, n)} />
      </div>
      {pkg.description && <p className="mt-3 text-[14px] leading-6 text-stone-600">{tidyDescription(pkg.description)}</p>}
      {shown.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl bg-cream/50 ring-1 ring-stone-200">
          <ChoiceGroups
            groups={labelled}
            selections={selections}
            showErrors={showErrors}
            onToggle={onToggle}
            onCount={onCount}
            idPrefix={`line-${line.lineId}-`}
            perPerson
            className="border-b border-stone-200 px-4 py-5 last:border-b-0 sm:px-5"
          />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-ink">
          <span className="font-bold tabular-nums">{line.quantity}</span> {line.quantity === 1 ? "person" : "people"} × <span className="tabular-nums">{money(line.unitPrice)}</span> ={" "}
          <strong className="tabular-nums">{money(line.unitPrice * line.quantity)}</strong>
        </p>
        <button type="button" onClick={() => cart.remove(line.lineId)} className="inline-flex items-center gap-1 text-[13px] font-bold text-stone-500 hover:text-brand">
          <Trash2 className="size-3.5" aria-hidden />
          Remove
        </button>
      </div>
    </div>
  );
}

// ---- The form ---------------------------------------------------------------

export default function CateringOrder({ packages, stores, initialStoreId }: { packages: CateringPackage[]; stores: Store[]; initialStoreId: string }) {
  const { c, storeId } = useOrderStore(stores, initialStoreId);
  const [showErrors, setShowErrors] = useState(false);
  const [adding, setAdding] = useState(false);
  // How many, before a package is picked.
  const [people, setPeople] = useState(DEFAULT_PEOPLE);
  const here = packages.filter((p) => p.location_id === storeId);
  const byId = new Map(packages.map((p) => [p.id, p]));
  const lines = c.lines.filter((l) => byId.has(l.menuItemId));
  const store = stores.find((s) => s.id === storeId);
  const totals = cartTotals(c, Number(store?.tax_rate ?? 0.13));

  // A package that's gone from the menu since it was picked comes out.
  useEffect(() => {
    const gone = c.lines.filter((l) => !byId.has(l.menuItemId));
    gone.forEach((l) => cateringCart.cart.remove(l.lineId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.lines, packages]);

  // Another store: the same packages and choices (by name) at that store.
  const moveTo = useCallback(
    (nextId: string) => {
      const there = packages.filter((p) => p.location_id === nextId);
      const moved = cateringCart.get().lines.flatMap((l) => {
        const from = byId.get(l.menuItemId);
        const to = from && there.find((p) => p.name === from.name);
        if (!from || !to) return [];
        const picked: Selections = {};
        for (const o of l.options) {
          const group = from.groups.find((g) => g.options.some((x) => x.id === o.optionId));
          const option = group?.options.find((x) => x.id === o.optionId);
          const toGroup = group && to.groups.find((g) => g.name === group.name);
          const toOption = option && toGroup?.options.find((x) => x.name === option.name);
          if (toGroup && toOption) (picked[toGroup.id] ??= []).push(toOption.id);
        }
        return [{ ...lineFor(to, l.quantity, Object.keys(picked).length ? picked : undefined), lineId: l.lineId }];
      });
      cateringCart.cart.reset({ storeId: nextId, storeName: storeName(stores, nextId), lines: moved });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packages, stores]
  );

  const validate = () => {
    for (const line of lines) {
      const pkg = byId.get(line.menuItemId)!;
      const selections = selectionsFromOptions(pkg.groups, line.options);
      const missing = missingGroup(visibleGroups(pkg.groups, selections), selections);
      if (missing) {
        setShowErrors(true);
        return { message: `Choose ${missing.name.replace(/\s*\(.*\)$/, "")} for ${pkg.name}.`, target: `line-${line.lineId}-${missing.id}` };
      }
    }
    return null;
  };

  const startWith = (pkg: CateringPackage, people: number) => {
    cateringCart.cart.append(lineFor(pkg, people), { id: pkg.location_id, name: storeName(stores, pkg.location_id) });
    setAdding(false);
  };

  const builder = (
    <div className="space-y-5">
      {lines.length === 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <PackageSelect id="package-new" label="Package selection" value="" packages={here} onPick={(pkg) => startWith(pkg, people)} />
            <PeopleInput id="people-new" stacked label="Number of people" value={people} onChange={setPeople} />
          </div>
          <p className="text-[14px] text-stone-500">
            Prices are per person, salad and dessert included.{" "}
            <JumpLink to="packages" className="font-bold text-brand hover:underline">
              Compare the spreads
            </JumpLink>
          </p>
        </>
      )}
      {lines.map((line) => (
        <PackageLine key={line.lineId} line={line} pkg={byId.get(line.menuItemId)!} packages={here} showErrors={showErrors} plain={lines.length === 1} />
      ))}
      {lines.length > 0 &&
        (adding ? (
          <div className="rounded-xl p-4 ring-1 ring-stone-200 sm:p-5">
            <PackageSelect id="package-another" label="Add another package" value="" packages={here} onPick={(pkg) => startWith(pkg, lines[lines.length - 1]?.quantity ?? DEFAULT_PEOPLE)} />
            <button type="button" onClick={() => setAdding(false)} className="mt-3 text-[14px] font-bold text-stone-500 hover:text-ink">
              Never mind
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-[14px] font-extrabold text-brand hover:underline">
            <Plus className="size-4" aria-hidden />
            Add another package
          </button>
        ))}
    </div>
  );

  return (
    <>
      <Checkout
        stores={stores}
        orderStore={cateringCart}
        variant="catering"
        lead={{ title: "Your spread", id: "spread", node: builder }}
        onChooseStore={moveTo}
        onEditOrder={scrollToOrder}
        validate={validate}
      />
      <MobileTotalBar lines={lines.length} people={lines.reduce((n, l) => n + l.quantity, 0)} total={totals.total} />
    </>
  );
}

// Phones: the running total along the bottom while the form is on screen,
// with a jump to the summary and Order Now.
function MobileTotalBar({ lines, people, total }: { lines: number; people: number; total: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const form = document.getElementById("order");
    const summary = document.getElementById("order-summary");
    if (!form || !summary || typeof IntersectionObserver === "undefined") return;
    let formIn = false;
    let summaryIn = false;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.target === form) formIn = e.isIntersecting;
        if (e.target === summary) summaryIn = e.isIntersecting;
      });
      setShow(formIn && !summaryIn);
    });
    io.observe(form);
    io.observe(summary);
    return () => io.disconnect();
  }, [lines]);
  if (!lines || !show) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 p-3 backdrop-blur-md lg:hidden">
      <button
        type="button"
        onClick={() => document.getElementById("order-summary")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="flex w-full items-center justify-between rounded-lg bg-brand px-4 py-3.5 text-white shadow-lg shadow-brand/25"
      >
        <span className="flex items-center gap-2 text-[15px] font-extrabold uppercase tracking-wide">
          <Users className="size-5" aria-hidden />
          {people} {people === 1 ? "person" : "people"} · Review
          <ArrowDown className="size-4" aria-hidden />
        </span>
        <span className="text-[15px] font-extrabold tabular-nums">{money(total)}</span>
      </button>
    </div>
  );
}
