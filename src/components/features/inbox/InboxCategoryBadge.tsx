import { CATEGORY_LABEL } from "@/lib/inboxCategory";
import type { InboxCategory } from "@/lib/inboxCategory";

/** Teal for a SLICR report, indigo for a state request, rose for a void, amber for a notice, grey for anything else. */
const CATEGORY_CLASSES: Record<InboxCategory, string> = {
  slicr: "bg-teal-50 text-teal-700 border-teal-200",
  request: "bg-indigo-50 text-indigo-700 border-indigo-200",
  void: "bg-rose-50 text-rose-700 border-rose-200",
  notice: "bg-amber-50 text-amber-800 border-amber-200",
  other: "bg-gray-100 text-gray-600 border-gray-200",
};

/** The coloured pill that says what kind of email this is (SLICR report, state request, void, notice). */
export function InboxCategoryBadge({ category }: { category: InboxCategory }) {
  return (
    <span data-inbox-category={category} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_CLASSES[category]}`}>
      {CATEGORY_LABEL[category]}
    </span>
  );
}
