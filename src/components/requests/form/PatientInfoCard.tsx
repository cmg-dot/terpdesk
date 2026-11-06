"use client";

import { Lock } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { FormField, cardClass, inputClass, sectionTitleClass, textareaClass } from "@/components/requests/form/formStyles";
import { HEARING_IDENTITY_OPTIONS, identityLabel } from "@/lib/hearingIdentity";
import type { FormExtras } from "@/lib/requestFormExtras";

type Field = "providerOneNumber" | "clientGender" | "hearingIdentity" | "otherPatientInfo";

/** Gender is free text on the state's form; the form offers these, and a saved value that is not one of them stays shown. */
const NOT_SPECIFIED = "Not specified";
const GENDER_OPTIONS = [NOT_SPECIFIED, "Female", "Male", "Non-binary"];

/**
 * Section 5 of the state form as its own staff-only card: ProviderOne number, gender and hearing identity, and (only when the
 * saved form has lines no field covers) those other lines. None of it is ever sent to an interpreter or put in a link.
 * Every field is optional, whatever the funding program.
 */
export function PatientInfoCard({ values, showOther, onChange }: { values: FormExtras; showOther: boolean; onChange: (field: Field, value: string) => void }) {
  const labels = HEARING_IDENTITY_OPTIONS.map((o) => o.label);
  return (
    <div className={`${cardClass} !border-amber-200 !bg-amber-50/40`} data-form-card="patient-information">
      <div className="flex items-start gap-3">
        <Lock className="mt-1 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <div>
          <h2 className={`${sectionTitleClass} !mb-1`}>Patient Information (Staff Only - Never shared with interpreters)</h2>
          <p className="text-xs text-gray-500">Optional. Kept on the request for staff and left out of offers, emails, the interpreter app and magic links.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FormField label="Provider One #" htmlFor="patient-provider-one">
          <input id="patient-provider-one" type="text" autoComplete="off" maxLength={40} className={inputClass} value={values.providerOneNumber} onChange={(e) => onChange("providerOneNumber", e.target.value)} />
        </FormField>
        <FormField label="Gender">
          <CustomSelect
            options={GENDER_OPTIONS}
            value={values.clientGender.trim() || NOT_SPECIFIED}
            onChange={(label) => onChange("clientGender", label === NOT_SPECIFIED ? "" : label)}
          />
        </FormField>
        <FormField label="Hearing Identity">
          <CustomSelect
            options={labels}
            value={identityLabel(values.hearingIdentity) || labels[0]}
            onChange={(label) => onChange("hearingIdentity", HEARING_IDENTITY_OPTIONS.find((o) => o.label === label)?.value ?? "")}
          />
        </FormField>
      </div>
      {showOther && (
        <FormField label="Other details from the state's form" htmlFor="patient-other" subtext="Kept as the state sent them (for example Interpreter Gender and Comment).">
          <textarea id="patient-other" className={`${textareaClass} min-h-[90px]`} maxLength={2000} value={values.otherPatientInfo} onChange={(e) => onChange("otherPatientInfo", e.target.value)} />
        </FormField>
      )}
    </div>
  );
}
