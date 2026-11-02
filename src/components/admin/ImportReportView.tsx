import type { ImportReport } from "@/lib/workbookImport/types";

const money = (value: string | null): string => (value === null ? "—" : `$${value}`);
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
    <p className="text-2xl font-semibold text-[var(--ink)]">{value}</p>
    <p className="text-[13px] text-gray-600">{label}</p>
  </div>
);

const NameList = ({ title, names }: { title: string; names: string[] }) =>
  names.length === 0 ? null : (
    <div>
      <p className="font-medium text-gray-800">{title}</p>
      <p className="text-[13px] text-gray-600">{names.join(", ")}</p>
    </div>
  );

/** What the workbook contained and what happened (or would happen) to it. */
export const ImportReportView = ({ report, done }: { report: ImportReport; done: boolean }) => {
  const { outcome } = report;
  const verb = done ? "" : "will be ";
  const hidden = report.notesTotal - report.notes.length;

  return (
    <div role="status" className="space-y-5 text-sm text-gray-800">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={done ? "Added" : "To add"} value={outcome.created} />
        <Stat label={done ? "Updated (blanks filled)" : "To update (blanks filled)"} value={outcome.filledExisting} />
        <Stat label="Already complete" value={outcome.unchangedExisting} />
        <Stat label="Left alone (not on your roster)" value={outcome.skippedNotOnRoster} />
      </div>

      <p>
        Read <strong>{plural(report.stateRows, "interpreter", "interpreters")}</strong> on the State Rate sheet and{" "}
        <strong>{plural(report.nonStateRows, "interpreter", "interpreters")}</strong> on the non-state sheet. <strong>{report.matched}</strong> matched by name,
        making <strong>{plural(report.people, "person", "people")}</strong> in total.
      </p>

      {report.withoutEmail > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          {plural(report.withoutEmail, "person has", "people have")} no email in the workbook. Their rates {verb}import
          {done ? "ed" : ""} anyway, under a placeholder address that never receives mail. Add their real email later.
        </p>
      )}
      {outcome.skippedNotOnRoster > 0 && (
        <p className="text-gray-600">Anyone already in terpDESK is never overwritten: only empty fields are filled, and only for people on your roster.</p>
      )}
      {(report.withCertification > 0 || report.withQualifications > 0) && (
        <p className="text-gray-600">
          {report.withCertification} certification and {report.withQualifications} qualification entries were read but are not saved: interpreter profiles have
          no field for them yet.
        </p>
      )}

      <NameList title="Only on the State Rate sheet (no match on the other sheet)" names={report.unmatchedState} />
      <NameList title="Only on the non-state sheet (no match on the State Rate sheet)" names={report.unmatchedNonState} />

      {report.notes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <p className="font-medium">{plural(report.notesTotal, "thing", "things")} to look at in the workbook:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
            {report.notes.map((note, index) => (
              <li key={`${note.where}-${index}`}>
                <span className="font-medium">{note.where}:</span> {note.message}
              </li>
            ))}
          </ul>
          {hidden > 0 && <p className="mt-1 text-[13px]">…and {hidden} more.</p>}
        </div>
      )}

      {report.sample.length > 0 && (
        <div>
          <p className="mb-2 font-medium text-gray-800">First {report.sample.length} people, as they will be saved</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {["Name", "City", "Email", "State", "King County", "Non-state"].map((heading) => (
                    <th key={heading} scope="col" className="px-3 py-2 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.sample.map((person) => (
                  <tr key={person.name} className="border-t border-gray-100">
                    <td className="px-3 py-2">{person.name}</td>
                    <td className="px-3 py-2">{person.city ?? "—"}</td>
                    <td className="px-3 py-2">{person.email ?? "none"}</td>
                    <td className="px-3 py-2">{money(person.stateRate)}</td>
                    <td className="px-3 py-2">{money(person.kingCountyRate)}</td>
                    <td className="px-3 py-2">{money(person.nonStateRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
