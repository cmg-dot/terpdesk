/**
 * Pure helpers for the FilterDropdown menu (components/ui/FilterDropdown.tsx): the choice type, and where to put the open
 * menu so it never runs off the screen. No DOM access, so it can be tested on its own.
 */

export interface DropdownOption {
  value: string;
  label: string;
  /** Shown muted at the end of the row (for example how many interpreters carry this tag). */
  count?: number;
  /** A small heading shown above the first option of each group. Options of one group should sit together. */
  group?: string;
}

/** The pieces of a rectangle the placement needs (a DOMRect fits). */
export interface Box {
  left: number;
  top: number;
  bottom: number;
}

export interface Placement {
  /** Open upwards (above the button) because there is more room there. */
  flipUp: boolean;
  /** Pixels to slide the menu sideways to keep it inside the screen. */
  dx: number;
  /** A smaller height cap for when the room is under the usual maximum; null = leave the CSS maximum alone. */
  maxHeight: number | null;
}

export const NEUTRAL_PLACEMENT: Placement = { flipUp: false, dx: 0, maxHeight: null };

const EDGE = 8;
const GAP = 6;
const MIN_HEIGHT = 96;

/**
 * Where to open a menu of size `panel` (measured while open below and left-aligned with the button) so it stays on screen:
 * above the button when below is too short and above has more room, slid sideways off the screen edges, and shortened to
 * the room there is (the menu scrolls inside itself).
 */
export const placePanel = (
  trigger: Box,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
): Placement => {
  const below = viewport.height - trigger.bottom - EDGE - GAP;
  const above = trigger.top - EDGE - GAP;
  const flipUp = panel.height > below && above > below;
  const room = flipUp ? above : below;

  let dx = 0;
  if (trigger.left + panel.width > viewport.width - EDGE) dx = viewport.width - EDGE - (trigger.left + panel.width);
  if (trigger.left + dx < EDGE) dx = EDGE - trigger.left;

  return { flipUp, dx, maxHeight: panel.height > room ? Math.max(Math.floor(room), MIN_HEIGHT) : null };
};

/** The first choice that every dropdown starts with ("All credentials"), followed by the given choices. */
export const withAnyOption = (anyLabel: string, options: readonly { value: string; count: number }[]): DropdownOption[] => [
  { value: "", label: anyLabel },
  ...options.map((option) => ({ value: option.value, label: option.value, count: option.count })),
];
