// Prevents nonsensical modifier combinations on any item -- "No Cheese"
// with "Extra Cheese", "No Bacon" with "Add Bacon", etc. Works by parsing
// each option's leading verb ("No", "Extra", "Add", "Sub...") to get
// whether it adds or removes an ingredient, then comparing what's left.
//
// Two options conflict when one removes what the other adds:
//   * the same ingredient -- "No Provolone" / "Extra Provolone",
//     "No Parm" / "Extra Parmesan", "No Swiss Cheese" / "Extra Swiss Cheese";
//   * or a catch-all removal and anything of that kind -- "No Cheese"
//     blocks "Extra Parmesan", "Add Cheddar", "Sub Cheese Sauce For
//     Mozzarella"; "No Bacon" blocks "Sub For Halal Beef Bacon".
// Different ingredients never block each other, even of the same kind:
// "No Provolone" with "Extra Parmesan" is a real order (swap one cheese
// for more of the other), as is "No Bacon Jam" with "Add Bacon". And a
// catch-all add ("Extra Cheese") doesn't block removing one particular
// cheese ("No Parm") -- more of the rest, none of that one.

// Kinds of ingredient that have a catch-all option ("No Cheese") as well
// as named ones ("Extra Provolone"), and the words that mark each.
const KINDS: Record<string, string[]> = {
  cheese: ['cheese', 'cheeses', 'cheddar', 'mozzarella', 'mozarella', 'provolone', 'swiss', 'feta', 'parmesan', 'parm', 'brie', 'goat cheese'],
  bacon: ['bacon'],
  onion: ['onion', 'onions'],
  chicken: ['chicken'],
  pepperoni: ['pepperoni'],
  ham: ['ham'],
};
// What the catch-all option says after its verb: "No Cheese", "No Onions".
const CATCH_ALL: Record<string, string[]> = {
  cheese: ['cheese', 'cheeses', 'all cheese'],
  bacon: ['bacon'],
  onion: ['onion', 'onions'],
  chicken: ['chicken'],
  pepperoni: ['pepperoni'],
  ham: ['ham'],
};
// Spellings of the same ingredient.
const SAME_AS: Record<string, string> = {
  parmesan: 'parm',
  mozarella: 'mozzarella',
};

const ACTION_PATTERNS: [RegExp, 'remove' | 'add'][] = [
  [/^no\s+/, 'remove'],
  [/^extra\s+/, 'add'],
  [/^add\s+/, 'add'],
  [/^substitute\s+(for\s+)?/, 'add'],
  [/^sub\s+(for\s+)?/, 'add'],
];

type Parsed = { sign: 'remove' | 'add' | 'neutral'; ingredient: string; kinds: string[]; catchAll: string | null };

const hasWord = (text: string, word: string) =>
  new RegExp(`(^|\\s)${word.replace(/\s+/g, '\\s+')}($|\\s)`).test(text);

// "Swiss Cheese" -> "swiss", "Parmesan" -> "parm", "Pickles" -> "pickle",
// "Tomatoes" -> "tomato": one spelling per ingredient.
function canonical(ingredient: string): string {
  let words = ingredient.split(/\s+/).map((w) => SAME_AS[w] ?? w);
  if (words.length > 1 && words[words.length - 1] === 'cheese') words = words.slice(0, -1);
  const last = words[words.length - 1];
  if (last.endsWith('oes')) words[words.length - 1] = last.slice(0, -2);
  else if (last.length > 3 && last.endsWith('s') && !last.endsWith('ss')) words[words.length - 1] = last.slice(0, -1);
  return words.join(' ');
}

function parseOption(name: string): Parsed {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [pattern, sign] of ACTION_PATTERNS) {
    if (!pattern.test(normalized)) continue;
    let rest = normalized.replace(pattern, '').replace(/^extra\s+/, '');
    // "Sub Cheddar For Mozzarella" adds the cheddar.
    if (/^sub/.test(normalized)) rest = rest.replace(/\s+for\s+.*$/, '');
    rest = rest.trim();
    const kinds = Object.keys(KINDS).filter((kind) => KINDS[kind].some((word) => hasWord(rest, word)));
    const catchAll = Object.keys(CATCH_ALL).find((kind) => CATCH_ALL[kind].includes(rest)) ?? null;
    return { sign, ingredient: catchAll ? `all ${catchAll}` : canonical(rest), kinds, catchAll };
  }
  return { sign: 'neutral', ingredient: normalized, kinds: [], catchAll: null };
}

// True when one option adds what the other removes -- e.g.
// optionsConflict("No Cheese", "Extra Swiss Cheese") and
// optionsConflict("No Provolone", "Extra Provolone") are true;
// optionsConflict("No Provolone", "Extra Parmesan") is false.
// Options with no recognized No/Extra/Add/Sub prefix (e.g. "Spicy", a plain
// drink name) never conflict with anything.
export function optionsConflict(nameA: string, nameB: string): boolean {
  const a = parseOption(nameA);
  const b = parseOption(nameB);
  if (a.sign === 'neutral' || b.sign === 'neutral' || a.sign === b.sign) return false;
  if (a.ingredient === b.ingredient) return true;
  const removal = a.sign === 'remove' ? a : b;
  const addition = a.sign === 'remove' ? b : a;
  return !!removal.catchAll && addition.kinds.includes(removal.catchAll);
}
