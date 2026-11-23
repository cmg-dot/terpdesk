import { PersonalJobsBoard } from "@/components/myWork/PersonalJobsBoard";
import { loadMyWork } from "@/lib/myWorkData";

export const metadata = { title: "My work | terpDESK" };
export const dynamic = "force-dynamic";

const PROBLEMS = {
  not_ready: "My work is not set up on this database yet. Please check back soon.",
  not_linked: "Connect your interpreter profile (use the link we emailed you) before logging personal jobs.",
  error: "We couldn't load your personal jobs. Please refresh the page.",
} as const;

export default async function MyWorkPage() {
  // The middleware requires an interpreter session (and signs an idle one out); the loader reads only that interpreter's own jobs.
  const data = await loadMyWork();

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-6 p-4 pb-24 antialiased sm:p-6">
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">My work</h1>
        <p className="max-w-3xl text-[15px] text-[var(--sage)]">
          Jobs you do on your own, outside any agency: when, how long and how far, for your own records. No rates or earnings are kept. Agencies never see what these are;
          at most they see that you are unavailable at that time.
        </p>
      </div>
      {data.status === "ok" ? (
        <PersonalJobsBoard initialJobs={data.jobs} defaultTimeZone={data.timeZone} generatedAt={data.generatedAt} />
      ) : (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {PROBLEMS[data.status]}
        </div>
      )}
    </div>
  );
}
