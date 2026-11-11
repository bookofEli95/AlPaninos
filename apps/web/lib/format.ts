// "$1,240.00" -- cents always, and a comma once catering gets into the
// thousands.
const dollars = new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (value: number | string | null | undefined) => `$${dollars.format(Number(value ?? 0))}`;

// "Chicken Cutlet / Spicy Marinara / Provolone" (how the menu writes
// ingredients) reads as a list on the web: "Chicken Cutlet, Spicy Marinara,
// Provolone".
export const tidyDescription = (text: string | null | undefined) =>
  (text ?? "")
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

// "+15195550100" -> "(519) 555-0100" for North American numbers; others as saved.
export const prettyPhone = (phone: string | null | undefined) => {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : null;
  return local ? `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}` : phone ?? "";
};
