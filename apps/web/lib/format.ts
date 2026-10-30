export const money = (value: number | string | null | undefined) => `$${Number(value ?? 0).toFixed(2)}`;

// "Chicken Cutlet / Spicy Marinara / Provolone" (how the menu writes
// ingredients) reads as a list on the web: "Chicken Cutlet, Spicy Marinara,
// Provolone".
export const tidyDescription = (text: string | null | undefined) =>
  (text ?? "")
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
