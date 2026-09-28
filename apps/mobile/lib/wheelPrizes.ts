// Visual definition of the welcome wheel's segments only -- the actual odds
// live server-side in claim_wheel_prize() (see the spin_wheel migration) so
// they can't be read or tampered with from the client. All 7 segments are
// drawn the same size regardless of how rare they are (same convention most
// real-world prize wheels use); index must match the prize_index values
// that migration returns, in the same order, or the wheel will visually
// land on the wrong segment for what was actually won.
export type WheelSegment = {
  index: number;
  label: string;
  color: string;
  // Purely cosmetic -- mirrors claim_wheel_prize()'s category_name/
  // item_name_patterns per index (see the spin_wheel migration) so the win
  // popup can show a real photo of what was won instead of a generic icon.
  // Unlike WHEEL_SEGMENT_ANGLE/index ordering above, drifting from the
  // server here only ever picks the wrong photo, never the wrong prize or
  // discount, so it doesn't need to be authoritative.
  categoryName?: string;
  itemNamePatterns?: string[];
  // A specific photo in the menu-images storage bucket to show instead of
  // picking one of the category's item photos.
  imageFile?: string;
};

// Roulette colours: bright red and black taking turns all the way round,
// with the Grand Prize the only gold wedge. (The wheel screen shades each
// one for depth.)
//
// Each line is kept short (roughly 10 characters or fewer) since the wedges
// are narrow (~51deg) -- a long unbroken word here is what was overflowing
// past the segment's edge into its neighbor.
export const WHEEL_SEGMENTS: WheelSegment[] = [
  { index: 0, label: '25% OFF\nNEXT ORDER', color: '#E11D2E' },
  { index: 1, label: 'FREE\nCHOICE\nOF POP', color: '#151515', categoryName: 'Drinks', imageFile: 'drinks.jpg' },
  { index: 2, label: 'FREE MOB\nSANDWICH', color: '#E11D2E', categoryName: 'The Mob' },
  { index: 3, label: 'GRAND\nPRIZE', color: '#FFC72C' },
  {
    index: 4,
    label: 'FREE\nSPECIALTY\nFRIES',
    color: '#151515',
    categoryName: 'Sides',
    itemNamePatterns: ['Greek Fries', 'Philly Fries', 'Fries N Gravy', 'Pulled Pork Fries'],
  },
  { index: 5, label: 'FREE\nFRIES', color: '#E11D2E', categoryName: 'Sides', itemNamePatterns: ['Fries'] },
  { index: 6, label: '1000\nPANINO\nPOINTS', color: '#151515' },
];

export const WHEEL_SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;
