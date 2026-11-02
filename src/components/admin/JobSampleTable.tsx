import type { SampleJob } from "@/lib/jobImport/types";

const RESULT_STYLE: Record<string, string> = {
  exact: "bg-emerald-50 text-emerald-800 border-emerald-200",
  partial: "bg-sky-50 text-sky-800 border-sky-200",
  ambiguous: "bg-amber-50 text-amber-900 border-amber-200",
  none: "bg-gray-100 text-gray-700 border-gray-200",
};
const RESULT_LABEL: Record<string, string> = { exact: "matched", partial: "partial match", ambiguous: "more than one person", none: "not on roster" };

const NameChip = ({ name, result, matchedTo }: SampleJob["names"][number]) => (
  <li className={`rounded-lg border px-2 py-1 text-[12px] ${RESULT_STYLE[result]}`}>
    <span className="font-medium">{name}</span>
    {matchedTo && matchedTo.toLowerCase() !== name.toLowerCase() && <span> → {matchedTo}</span>}
    <span className="ml-1 opacity-80">({RESULT_LABEL[result]})</span>
  </li>
);

/** Parsed rows, so the dates, the UTC timestamps and the split names can be checked by eye before saving. */
export const JobSampleTable = ({ title, jobs }: { title: string; jobs: SampleJob[] }) =>
  jobs.length === 0 ? null : (
    <div>
      <p className="mb-2 font-medium text-gray-800">{title}</p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              {["Row", "Date", "Start – end (local)", "Saved as (UTC)", "Interpreter cell", "Split into"].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.line} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2">{job.line}</td>
                <td className="whitespace-nowrap px-3 py-2">{job.date}</td>
                <td className="whitespace-nowrap px-3 py-2">{job.startTime} – {job.endTime}</td>
                <td className="px-3 py-2 font-mono text-[11.5px] text-gray-600">{job.startsAt}<br />{job.endsAt}</td>
                <td className="px-3 py-2">{job.raw ?? <span className="text-gray-400">empty</span>}</td>
                <td className="px-3 py-2">
                  {job.names.length === 0 ? <span className="text-gray-400">nobody</span> : <ul className="flex flex-wrap gap-1.5">{job.names.map((n) => <NameChip key={n.name} {...n} />)}</ul>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
