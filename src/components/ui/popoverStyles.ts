/**
 * The look shared by every floating panel (dropdown menus, calendar and time pickers): cream (#FBFAF6) surface, thin gray
 * border, deep shadow, and the top of the stack (z-[9999]) so nothing on the page or in a modal can cover it.
 *
 * Kept in components/ on purpose: Tailwind only scans pages/, components/ and app/, so classes written in lib/ would be dropped.
 */

/**
 * Scrollbar for a scrolling panel, written out in full so it does not depend on a global stylesheet: a thin primary-emerald
 * (#0b3b32) thumb on the cream track. The ::-webkit rules cover Chrome / Edge / Safari; the standard scrollbar-color /
 * scrollbar-width cover Firefox and current Chrome (which uses them instead of ::-webkit once they are set).
 */
export const SCROLLBAR_CLASS =
  "[scrollbar-width:thin] [scrollbar-color:#0b3b32_#fbfaf6] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[#fbfaf6] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-[#fbfaf6] [&::-webkit-scrollbar-thumb]:bg-[var(--forest)] [&::-webkit-scrollbar-thumb:hover]:bg-[var(--forest-hover)]";

/** A floating panel: fixed to the screen (so no overflow rule on a parent can clip it), cream, bordered, shadowed. */
export const POPOVER_CLASS =
  "fixed z-[9999] rounded-xl border border-gray-200 bg-[#FBFAF6] shadow-xl ring-1 ring-black/5";
