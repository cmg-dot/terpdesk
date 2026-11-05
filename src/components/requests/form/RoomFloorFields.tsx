"use client";

import { FormField, inputClass } from "@/components/requests/form/formStyles";

/** Floor and room, beside the building, for any format: a virtual or hybrid job can still have a place to go. */
export function RoomFloorFields({ floor, room, onChange }: { floor: string; room: string; onChange: (field: "floor" | "room", value: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
      <FormField label="Floor" htmlFor="request-floor">
        <input id="request-floor" type="text" maxLength={40} className={inputClass} value={floor} onChange={(e) => onChange("floor", e.target.value)} />
      </FormField>
      <FormField label="Room" htmlFor="request-room">
        <input id="request-room" type="text" maxLength={40} className={inputClass} value={room} onChange={(e) => onChange("room", e.target.value)} />
      </FormField>
    </div>
  );
}
