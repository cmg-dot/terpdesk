"use client";

import { VirtualMeetingFields, isVirtualFormat } from "@/components/requests/VirtualMeetingFields";
import type { VirtualMeetingField } from "@/components/requests/VirtualMeetingFields";
import type { QuickEditValues } from "@/lib/quickEditAccess";

const labelClass = "mb-1 block text-xs font-medium text-gray-700";
const inputClass = "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[var(--forest)]";

interface Props {
  values: QuickEditValues;
  onChange: (patch: Partial<QuickEditValues>) => void;
}

/** The meeting details for a virtual appointment, or the venue and contact for an in-person one. */
export const QuickEditLocation = ({ values, onChange }: Props) => {
  if (isVirtualFormat(values.format)) {
    return (
      <VirtualMeetingFields
        values={{ platform: values.platform, meetingLink: values.meetingLink, meetingId: values.meetingId, passcode: values.passcode, virtualInstructions: values.virtualInstructions }}
        onChange={(field: VirtualMeetingField, value: string) => onChange({ [field]: value })}
      />
    );
  }

  return (
    <div className="space-y-3.5 rounded-xl border border-gray-200 bg-white/70 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Physical Location Details</h4>

      <div>
        <label htmlFor="quick-edit-venue" className={labelClass}>Venue / Facility Name</label>
        <input id="quick-edit-venue" type="text" placeholder="e.g. Medical Center or Clinic" value={values.venue} onChange={(e) => onChange({ venue: e.target.value })} className={inputClass} />
      </div>

      <div>
        <label htmlFor="quick-edit-address" className={labelClass}>Address</label>
        <input id="quick-edit-address" type="text" placeholder="e.g. 325 9th Ave, Seattle, WA 98104" value={values.address} onChange={(e) => onChange({ address: e.target.value })} className={inputClass} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="quick-edit-building" className={labelClass}>Building / Room</label>
          <input id="quick-edit-building" type="text" placeholder="e.g. West Wing, Room 302" value={values.building} onChange={(e) => onChange({ building: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="quick-edit-contact" className={labelClass}>On-site Contact</label>
          <input id="quick-edit-contact" type="text" placeholder="e.g. Dr. Silva" value={values.contact} onChange={(e) => onChange({ contact: e.target.value })} className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="quick-edit-contact-method" className={labelClass}>Contact Method</label>
        <input id="quick-edit-contact-method" type="text" placeholder="e.g. Text message or Phone" value={values.contactMethod} onChange={(e) => onChange({ contactMethod: e.target.value })} className={inputClass} />
      </div>
    </div>
  );
};
