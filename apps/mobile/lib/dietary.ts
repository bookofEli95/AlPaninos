// Dietary tags (menu_items.dietary_tags -- see the catering_tools
// migration). Only ever positive ("contains"), never "free of": an untagged
// item is not a promise, which is what DIETARY_DISCLAIMER tells customers.
export const DIETARY_LABELS: Record<string, string> = {
  nuts: 'Contains Nuts',
  pork: 'Contains Pork',
  vegetarian: 'Vegetarian',
};

export const DIETARY_DISCLAIMER =
  "Tags show what each recipe lists. Our kitchen also handles nuts, pork, dairy and gluten, so we can't guarantee any item is free of them. Please ask us about allergies.";

export function dietaryLabels(tags: string[] | null | undefined): string[] {
  return (tags || []).map((t) => DIETARY_LABELS[t]).filter((l): l is string => !!l);
}
