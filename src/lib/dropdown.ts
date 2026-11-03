/**
 * Pure helpers for the Dropdown menu (components/ui/Dropdown.tsx): the choice type, and where to put the open menu so it
 * never runs off the screen. No DOM access, so it can be tested on its own.
 */

export interface DropdownOption {
  value: string;
  label: string;
  /** Shown muted at the end of the row (for example how many interpreters carry this tag). */
  count?: number;
  /** A small heading shown above the first option of each group. Options of one group should sit together. */
  group?: string;
}

/** Where the button is on screen when the menu opens (viewport pixels). */
export interface Anchor {
  left: number;
  top: number;
  bottom: number;
  width: number;
  /** The window height at that moment, so an upward menu can hang from the button's top edge. */
  viewportHeight: number;
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

/** The menu's usual maximum height in pixels (Tailwind max-h-64). */
export const MENU_MAX_HEIGHT = 256;
const EDGE = 8;
const GAP = 6;
const MIN_HEIGHT = 96;

/**
 * Where to open a menu of size `panel` (its natural size, as if opened below and left-aligned with the button) so it stays
 * on screen: above the button when below is too short and above has more room, slid sideways off the screen edges, and
 * shortened to the room there is (the menu scrolls inside itself).
 */
export const placePanel = (
  trigger: Pick<Anchor, "left" | "top" | "bottom">,
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

/** The fixed-position CSS that puts the menu under (or over) the button, slid and capped as `placement` says. */
export const menuPosition = (anchor: Anchor, placement: Placement) => ({
  left: anchor.left + placement.dx,
  minWidth: anchor.width,
  maxHeight: placement.maxHeight ?? undefined,
  ...(placement.flipUp ? { bottom: anchor.viewportHeight - anchor.top + GAP } : { top: anchor.bottom + GAP }),
});

/** The first choice that a filter dropdown starts with ("All credentials"), followed by the given choices. */
export const withAnyOption = (anyLabel: string, options: readonly { value: string; count: number }[]): DropdownOption[] => [
  { value: "", label: anyLabel },
  ...options.map((option) => ({ value: option.value, label: option.value, count: option.count })),
];

/** Choices whose label is the same as their value (time zones, platforms, plain lists). */
export const plainOptions = (values: readonly string[]): DropdownOption[] => values.map((value) => ({ value, label: value }));

/** `options`, plus `value` as an extra first choice when it is set but not among them (so a stored value never vanishes). */
export const withCurrent = (options: readonly DropdownOption[], value: string): DropdownOption[] =>
  value === "" || options.some((option) => option.value === value) ? [...options] : [{ value, label: value }, ...options];
