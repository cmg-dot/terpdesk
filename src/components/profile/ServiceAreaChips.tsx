import { badgeBase } from "@/components/profile/credentialFormat";
import { VIRTUAL_ONLY_AREA } from "@/lib/serviceAreas";

/** Read-only service areas as pills; "Virtual Only" is blue so it stands apart from geographic areas. */
export const ServiceAreaChips = ({ areas }: { areas: readonly string[] }) =>
  areas.length === 0 ? (
    <span className="text-gray-400">Not set</span>
  ) : (
    <ul className="flex flex-wrap gap-1.5 sm:justify-end">
      {areas.map((area) => (
        <li
          key={area}
          className={`${badgeBase} ${area === VIRTUAL_ONLY_AREA ? "border-blue-200 bg-blue-50 text-blue-700" : "border-stone-200 bg-white text-gray-700"}`}
        >
          {area}
        </li>
      ))}
    </ul>
  );
