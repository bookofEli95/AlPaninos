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
};

// Each line is kept short (roughly 10 characters or fewer) since the wedges
// are narrow (~51deg) -- a long unbroken word here is what was overflowing
// past the segment's edge into its neighbor.
export const WHEEL_SEGMENTS: WheelSegment[] = [
  { index: 0, label: '25% OFF\nNEXT ORDER', color: '#A61C14' },
  { index: 1, label: 'FREE\nCHOICE\nOF POP', color: '#1C1917' },
  { index: 2, label: 'FREE MOB\nSANDWICH', color: '#A61C14' },
  { index: 3, label: 'GRAND\nPRIZE', color: '#D4A017' },
  { index: 4, label: 'FREE\nSPECIALTY\nFRIES', color: '#1C1917' },
  { index: 5, label: 'FREE\nFRIES', color: '#A61C14' },
  { index: 6, label: '1000\nPANINO\nPOINTS', color: '#1C1917' },
];

export const WHEEL_SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;
