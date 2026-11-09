"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, Gift, Loader2, Users, X } from "lucide-react";
import FoodPhoto from "@/components/food-photo";
import ChoiceGroups from "./choice-groups";
import PeopleInput from "./people-input";
import QuantityStepper from "./quantity-stepper";
import { useModal } from "./use-modal";
import { useOrdering, type Reward } from "./ordering-provider";
import { browserSupabase } from "@/lib/browser-supabase";
import { cart, getCart, useCart } from "@/lib/cart";
import {
  cartOptions,
  changeChoiceCount,
  defaultSelections,
  missingGroup,
  priceWithChoices,
  selectionsFromOptions,
  toggleChoice,
  visibleGroups as shownGroups,
  type ChoiceGroup as Group,
  type ChoiceOption as Option,
  type Selections,
} from "@/lib/ordering/choices";
import { CATERING_RULES_SUMMARY, servesLabel } from "@/lib/ordering/catering";
import { money, tidyDescription } from "@/lib/format";

type Item = {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  location_id: string;
  category_id: string;
  is_available: boolean | null;
  is_catering: boolean | null;
  per_person?: boolean | null;
  serves_min: number | null;
  serves_max: number | null;
  drop_starts_at: string | null;
  drop_ends_at: string | null;
  menu_categories: { name: string } | null;
  locations: { name: string } | null;
};

const QUICK_NOTES = ["Cut in half", "Sauce on the side", "Extra crispy / well pressed", "Wrap separately"];

// One menu item's options, as the app's item screen (lib/ordering/choices),
// kitchen notes, and the price as it changes.
async function loadItem(itemId: string): Promise<{ item: Item; groups: Group[] }> {
  const supabase = browserSupabase();
  const { data: item, error } = await supabase
    .from("menu_items")
    .select("*, menu_categories(name), locations(name)")
    .eq("id", itemId)
    .single();
  if (error) throw error;
  const { data: groups, error: groupsError } = await supabase.from("modifier_groups").select("*").eq("menu_item_id", itemId).order("sort_order");
  if (groupsError) throw groupsError;
  let options: Option[] = [];
  if (groups?.length) {
    const { data, error: optionsError } = await supabase
      .from("modifier_options")
      .select("*")
      .in("group_id", groups.map((g) => g.id))
      .order("sort_order");
    if (optionsError) throw optionsError;
    options = (data ?? []) as Option[];
  }
  // A catering choice that is itself a menu item (a panino on a board)
  // shows that item's description.
  if (item.is_catering && options.length) {
    const names = Array.from(new Set(options.map((o) => o.name)));
    const { data } = await supabase.from("menu_items").select("name, description").eq("location_id", item.location_id).eq("is_catering", false).in("name", names);
    const byName = new Map((data ?? []).map((m) => [String(m.name).toLowerCase(), m.description as string | null]));
    options = options.map((o) => ({ ...o, description: byName.get(o.name.toLowerCase()) ?? null }));
  }
  return {
    item: item as Item,
    groups: (groups ?? []).map((g) => ({
      ...g,
      // A board's or pack's choices where more than one can be picked get
      // - / + (a per-person package's are plain picks: favourites, add-ons).
      allow_quantity: !!g.allow_quantity || (!!item.is_catering && !item.per_person && (g.max_selections ?? 0) > 1),
      options: options.filter((o) => o.group_id === g.id),
    })) as Group[],
  };
}

export default function ItemDialog({ itemId, editLineId, reward, onClose }: { itemId: string; editLineId?: string; reward?: Reward; onClose: () => void }) {
  const ref = useModal(true, onClose);
  const { notify, openCart } = useOrdering();
  const current = useCart();
  const [data, setData] = useState<{ item: Item; groups: Group[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selections>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const editing = editLineId ? getCart().lines.find((l) => l.lineId === editLineId) : undefined;
  // A free reward item (claimed, or being changed): $0 with its options, one.
  const claim = reward ?? (editing?.rewardCode ? { code: editing.rewardCode, title: editing.rewardTitle ?? "Free reward" } : undefined);

  useEffect(() => {
    let cancelled = false;
    loadItem(itemId)
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        const { groups } = loaded;
        if (editing) {
          // Back to what's in the order.
          setSelections(selectionsFromOptions(groups, editing.options));
          setQuantity(editing.quantity);
          setNotes(editing.specialInstructions ?? "");
          return;
        }
        // A per-person package starts at 10 people.
        if (loaded.item.per_person) setQuantity(10);
        setSelections(defaultSelections(groups));
      })
      .catch((e) => !cancelled && setLoadError(e?.message ?? "Please check your connection and try again."));
    return () => {
      cancelled = true;
    };
    // The line being edited is read once, when the builder opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const visibleGroups = useMemo(() => shownGroups(groups, selections), [groups, selections]);
  const toggle = (group: Group, optionId: string) => setSelections((prev) => toggleChoice(groups, prev, group, optionId));
  const changeCount = (group: Group, optionId: string, delta: 1 | -1) => setSelections((prev) => changeChoiceCount(prev, group, optionId, delta));
  const missing = missingGroup(visibleGroups, selections);
  const item = data?.item;
  const dropBlocked =
    !!item && ((!!item.drop_starts_at && openedAt < Date.parse(item.drop_starts_at)) || (!!item.drop_ends_at && openedAt >= Date.parse(item.drop_ends_at)));
  const unavailable = !!item && (item.is_available === false || dropBlocked);

  const unitPrice = useMemo(() => (item ? priceWithChoices(item.base_price, visibleGroups, selections) : 0), [item, visibleGroups, selections]);
  const perPerson = !!item?.per_person;

  const otherStore = !!item && !editing && !!current.storeId && current.storeId !== item.location_id && current.lines.length > 0;

  const add = (force = false) => {
    if (!item) return;
    if (missing) {
      setShowErrors(true);
      document.getElementById(`group-${missing.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (otherStore && !force) {
      setConfirmSwitch(true);
      return;
    }
    const options = cartOptions(visibleGroups, selections);
    const line = {
      menuItemId: item.id,
      name: item.name,
      categoryId: item.category_id,
      categoryName: item.menu_categories?.name ?? "",
      imageUrl: item.image_url,
      isCatering: !!item.is_catering,
      ...(perPerson ? { perPerson: true } : {}),
      options,
      unitPrice: claim ? 0 : unitPrice,
      quantity: claim ? 1 : quantity,
      specialInstructions: notes.trim() || undefined,
      ...(claim ? { rewardCode: claim.code, rewardTitle: claim.title } : {}),
    };
    if (editing) {
      cart.replace(editing.lineId, line);
      notify("Your order was updated.");
    } else {
      cart.add(line, { id: item.location_id, name: item.locations?.name ?? "" });
      notify(
        claim ? `Your free ${item.name} is in your order.` : perPerson ? `${item.name} for ${quantity} added to your order.` : `${quantity > 1 ? `${quantity} × ` : ""}${item.name} added to your order.`,
        { label: "View Order", onClick: openCart }
      );
    }
    onClose();
  };

  const toggleNote = (text: string) =>
    setNotes((prev) => {
      const parts = prev.split(",").map((s) => s.trim()).filter(Boolean);
      return (parts.includes(text) ? parts.filter((s) => s !== text) : [...parts, text]).join(", ");
    });

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={item?.name ?? "Menu item"}
        className="relative flex max-h-[94dvh] w-full max-w-5xl animate-[sheet-in_0.28s_cubic-bezier(0.2,0.8,0.2,1)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none sm:max-h-[90vh] sm:rounded-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-white/95 text-ink shadow-md ring-1 ring-black/5 transition hover:bg-white"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>

        {!data && !loadError && (
          <div className="flex h-80 items-center justify-center">
            <Loader2 className="size-7 animate-spin text-brand" aria-label="Loading" />
          </div>
        )}
        {loadError && (
          <div className="flex h-80 flex-col items-center justify-center gap-2 px-8 text-center">
            <AlertCircle className="size-8 text-brand" />
            <p className="font-bold text-ink">We couldn&apos;t load this item.</p>
            <p className="text-sm text-stone-500">{loadError}</p>
          </div>
        )}

        {item && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:overflow-hidden">
              {/* The item */}
              <div className="lg:overflow-y-auto lg:border-r lg:border-stone-200">
                <FoodPhoto src={item.image_url} alt={item.name} sizes="(min-width: 1024px) 420px, 100vw" priority className="aspect-[16/10] w-full lg:aspect-[4/3]" />
                <div className="p-5 sm:p-7">
                  {item.menu_categories?.name && (
                    <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-brand">{item.menu_categories.name}</p>
                  )}
                  <h2 className="mt-1.5 pr-10 font-display text-[1.75rem] font-extrabold leading-tight tracking-tight text-ink sm:text-[2rem] lg:pr-0">{item.name}</h2>
                  {item.description && <p className="mt-2.5 text-[15px] leading-6 text-stone-600">{tidyDescription(item.description)}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-2xl font-extrabold tabular-nums text-ink">
                      {money(item.base_price)}
                      {perPerson && <span className="text-[15px] font-bold text-stone-500"> / person</span>}
                    </span>
                    {!!item.serves_min && (
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500">
                        <Users className="size-4" aria-hidden />
                        {servesLabel(item.serves_min, item.serves_max)}
                      </span>
                    )}
                  </div>
                  {claim && (
                    <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-brand/5 p-3.5 text-[14px] font-semibold text-ink ring-1 ring-brand/30">
                      <Gift className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                      {claim.title}: this one&apos;s on us, options included.
                    </p>
                  )}
                  {item.is_catering && (
                    <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-cream p-3.5 text-[14px] font-medium text-ink ring-1 ring-stone-200">
                      <CalendarClock className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                      {CATERING_RULES_SUMMARY}
                    </p>
                  )}
                  {unavailable && (
                    <p className="mt-4 rounded-xl bg-stone-100 p-3.5 text-[14px] font-semibold text-stone-600">This item isn&apos;t available right now.</p>
                  )}
                </div>
              </div>

              {/* Its choices */}
              <div className="border-t border-stone-200 lg:overflow-y-auto lg:border-t-0">
                <ChoiceGroups groups={visibleGroups} selections={selections} showErrors={showErrors} onToggle={toggle} onCount={changeCount} insetFirst perPerson={perPerson} />

                {item.menu_categories?.name !== "Drinks" && (
                  <div className="px-5 py-5 sm:px-7">
                    <label htmlFor="kitchen-notes" className="text-[17px] font-extrabold text-ink">
                      Notes for the kitchen
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {QUICK_NOTES.map((text) => {
                        const on = notes.includes(text);
                        return (
                          <button
                            key={text}
                            type="button"
                            onClick={() => toggleNote(text)}
                            aria-pressed={on}
                            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 transition-colors ${
                              on ? "bg-ink text-white ring-ink" : "bg-white text-stone-700 ring-stone-300 hover:ring-stone-500"
                            }`}
                          >
                            {text}
                          </button>
                        );
                      })}
                    </div>
                    <textarea
                      id="kitchen-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value.slice(0, 200))}
                      rows={2}
                      placeholder="Allergies, packaging, anything we should know"
                      className="mt-3 w-full resize-none rounded-xl border border-stone-300 px-3.5 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Add to order */}
            <div className="border-t border-stone-200 bg-white px-4 py-3.5 sm:px-6">
              {confirmSwitch ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <p className="flex-1 text-[14px] text-ink">
                    Your order is from <strong>{current.storeName}</strong>. Start a new order at <strong>{item.locations?.name}</strong>? Your current items will be removed.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmSwitch(false)} className="rounded-lg px-4 py-3 text-[14px] font-bold text-ink ring-1 ring-stone-300 hover:bg-cream">
                      Keep My Order
                    </button>
                    <button type="button" onClick={() => add(true)} className="rounded-lg bg-brand px-4 py-3 text-[14px] font-extrabold text-white hover:bg-brand-dark">
                      Start New Order
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {!claim && perPerson && <PeopleInput value={quantity} onChange={setQuantity} />}
                  {!claim && !perPerson && <QuantityStepper value={quantity} onChange={(n) => setQuantity(Math.max(1, n))} />}
                  <button
                    type="button"
                    onClick={() => add()}
                    disabled={unavailable}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg bg-brand px-4 py-3.5 text-white transition-colors hover:bg-brand-dark disabled:bg-stone-300 disabled:text-stone-500 sm:px-5"
                  >
                    <span className="truncate whitespace-nowrap text-[14px] font-extrabold uppercase tracking-wide sm:text-[15px]">
                      {unavailable
                        ? "Unavailable"
                        : missing && showErrors
                        ? `Choose ${missing.name}`
                        : editing
                        ? "Update Order"
                        : claim
                        ? "Claim Free Item"
                        : perPerson
                        ? `Add for ${quantity}`
                        : "Add to Order"}
                    </span>
                    <span className="shrink-0 text-[16px] font-extrabold tabular-nums">{claim ? "FREE" : money(unitPrice * quantity)}</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
