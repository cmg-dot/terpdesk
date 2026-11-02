import { JobSampleTable } from "@/components/admin/JobSampleTable";
import type { JobsReport } from "@/lib/jobImport/types";

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
    <p className="text-2xl font-semibold text-[var(--ink)]">{value}</p>
    <p className="text-[13px] text-gray-600">{label}</p>
  </div>
);

const Box = ({ tone, children }: { tone: "amber" | "sky"; children: React.ReactNode }) => (
  <div className={`rounded-xl border p-3 ${tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>{children}</div>
);

/** What the Jobs sheet contained and what happened (or would happen) to it. */
export const JobsReportView = ({ report, done }: { report: JobsReport; done: boolean }) => {
  const { outcome, names } = report;
  const hiddenNotes = report.notesTotal - report.notes.length;

  return (
    <div role="status" className="space-y-5 text-sm text-gray-800">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={done ? "Jobs added" : "Jobs to add"} value={outcome.created} />
        <Stat label={done ? "Interpreters booked" : "Interpreters to book"} value={outcome.assignments} />
        <Stat label="Already imported" value={outcome.alreadyImported} />
        <Stat label="Rows skipped" value={report.rowsSkipped} />
      </div>

      <p>
        Read <strong>{plural(report.rowsRead, "row", "rows")}</strong>
        {report.firstDate && report.lastDate && <> dated <strong>{report.firstDate}</strong> to <strong>{report.lastDate}</strong></>}.{" "}
        {plural(report.jobsWithSeveralNames, "job names", "jobs name")} more than one interpreter and {report.jobsWithSeveralNames === 1 ? "becomes a team job" : "become team jobs"}.
        {" "}Nothing is emailed to anyone.
      </p>

      <p>
        Interpreter names: <strong>{names.exact}</strong> matched exactly, <strong>{names.partial}</strong> matched by first part of the name,{" "}
        <strong>{names.ambiguous}</strong> could be more than one person, <strong>{names.unmatched}</strong> are not on your roster. A job whose
        interpreter can&apos;t be matched is still added, with that position left open.
      </p>

      {report.partialMatches.length > 0 && (
        <Box tone="sky">
          <p className="font-medium">Matched by the first part of a name. Check these are the right people:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
            {report.partialMatches.map((p) => (
              <li key={`${p.name}-${p.matchedTo}`}>“{p.name}” → <strong>{p.matchedTo}</strong> ({plural(p.jobs, "job", "jobs")})</li>
            ))}
          </ul>
        </Box>
      )}

      {report.unmatched.length > 0 && (
        <Box tone="amber">
          <p className="font-medium">Not linked to anyone:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
            {report.unmatched.map((u) => (
              <li key={u.name}>“{u.name}” ({plural(u.jobs, "job", "jobs")}) — {u.reason === "ambiguous" ? "could be more than one person on your roster" : "not found on your roster"}</li>
            ))}
          </ul>
        </Box>
      )}

      {report.notes.length > 0 && (
        <Box tone="amber">
          <p className="font-medium">{plural(report.notesTotal, "thing", "things")} to look at in the workbook:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
            {report.notes.map((note, index) => (
              <li key={`${note.where}-${index}`}><span className="font-medium">{note.where}:</span> {note.message}</li>
            ))}
          </ul>
          {hiddenNotes > 0 && <p className="mt-1 text-[13px]">…and {hiddenNotes} more.</p>}
        </Box>
      )}

      {report.unusedColumns.length > 0 && (
        <p className="text-gray-600">Columns in the sheet that are not imported: {report.unusedColumns.join(", ")}.</p>
      )}

      <JobSampleTable title={`First ${report.sample.length} rows, as they will be saved`} jobs={report.sample} />
      <JobSampleTable title="Rows with more than one interpreter" jobs={report.multiSample} />
    </div>
  );
};
