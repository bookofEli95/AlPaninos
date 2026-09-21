// Prevents nonsensical modifier combinations on any item -- "No Cheese"
// with "Extra Cheese", "No Bacon" with "Add Bacon", etc. Works by parsing
// each option's leading verb ("No", "Extra", "Add", "Sub...") to get
// whether it adds or removes an ingredient, then comparing the remaining
// ingredient text. A handful of ingredients that come in several named
// variants in this menu (cheddar/mozzarella/provolone/swiss/feta/parm are
// all still "cheese") are grouped into a family so "No Cheese" blocks
// every cheese variant, not just an option named exactly "Cheese" --
// unrelated flavors that happen to share a word (e.g. "Garlic Aioli" vs
// "Cranberry Aioli") are deliberately NOT grouped, since those are
// different things a customer might legitimately want both toggled.
const FAMILY_KEYWORDS: Record<string, string[]> = {
  cheese: ['cheese', 'cheddar', 'mozzarella', 'mozarella', 'provolone', 'swiss', 'feta', 'parmesan', 'parm'],
  bacon: ['bacon'],
  onion: ['onion'],
  chicken: ['chicken'],
  pepperoni: ['pepperoni'],
  ham: ['ham'],
};

const ACTION_PATTERNS: [RegExp, 'remove' | 'add'][] = [
  [/^no\s+/, 'remove'],
  [/^extra\s+/, 'add'],
  [/^add\s+/, 'add'],
  [/^sub\s+for\s+/, 'add'],
  [/^sub\s+/, 'add'],
];

function ingredientKey(remainder: string): string {
  for (const [family, keywords] of Object.entries(FAMILY_KEYWORDS)) {
    if (keywords.some((kw) => remainder.includes(kw))) return family;
  }
  return remainder;
}

function parseOption(name: string): { sign: 'remove' | 'add' | 'neutral'; key: string } {
  const normalized = name.trim().toLowerCase();
  for (const [pattern, sign] of ACTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return { sign, key: ingredientKey(normalized.replace(pattern, '').trim()) };
    }
  }
  return { sign: 'neutral', key: normalized };
}

// True when one option adds an ingredient (or ingredient family) the other
// removes -- e.g. optionsConflict("No Cheese", "Extra Swiss Cheese") and
// optionsConflict("No Bacon", "Sub For Halal Beef Bacon") are both true.
// Options with no recognized No/Extra/Add/Sub prefix (e.g. "Spicy", a plain
// drink name) never conflict with anything.
export function optionsConflict(nameA: string, nameB: string): boolean {
  const a = parseOption(nameA);
  const b = parseOption(nameB);
  if (a.sign === 'neutral' || b.sign === 'neutral' || a.sign === b.sign) return false;
  return a.key === b.key;
}
