import { TimesheetForm } from "@/components/features/TimesheetForm";
import { TimesheetSubmitted } from "@/components/features/TimesheetSubmitted";
import { getPendingTimesheetByToken, getRecentTimesheetSubmission } from "@/lib/timesheets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Submit Timesheet | terpDESK", robots: { index: false, follow: false } };

interface PageProps {
  params: { token: string };
}

const formatWhen = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4 sm:px-6">
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
      <div className="bg-[#163C3A] px-6 py-4 flex justify-between items-center">
        <span className="text-white font-bold tracking-wide">TerpDESK</span>
      </div>
      <div className="p-6 sm:p-8">{children}</div>
    </div>
  </div>
);

export default async function TimesheetPage({ params }: PageProps) {
  const appointment = await getPendingTimesheetByToken(params.token);

  if (!appointment) {
    // Just submitted (this render follows the submission): dedicated success screen.
    const recent = await getRecentTimesheetSubmission(params.token);
    if (recent) {
      return (
        <Shell>
          <TimesheetSubmitted title={recent.title} />
        </Shell>
      );
    }
    // Opened later (already submitted, expired or invalid): the generic fallback.
    return (
      <Shell>
        <h1 className="mb-2 text-lg font-semibold text-gray-900">Link unavailable</h1>
        <p className="text-sm text-gray-600">
          This timesheet link is invalid, expired, or has already been submitted.
        </p>
      </Shell>
    );
  }

  const zone = appointment.ianaZone;

  return (
    <Shell>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Submit your timesheet</h1>
      <dl className="mb-6 space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
        <div>
          <dt className="text-xs uppercase text-gray-500">Appointment</dt>
          <dd className="font-medium text-gray-900">{appointment.title}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-gray-500">Scheduled</dt>
          <dd className="text-gray-900">
            {formatWhen(appointment.startsAt, zone)} – {formatWhen(appointment.endsAt, zone)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-gray-500">Format</dt>
          <dd className="text-gray-900">{appointment.format}</dd>
        </div>
        {appointment.location && (
          <div>
            <dt className="text-xs uppercase text-gray-500">Location</dt>
            <dd className="text-gray-900">{appointment.location}</dd>
          </div>
        )}
      </dl>
      <TimesheetForm
        token={params.token}
        defaultStart={appointment.defaultStart}
        defaultEnd={appointment.defaultEnd}
        timeZoneLabel={zone.replace(/_/g, " ")}
        isOdhh={appointment.isOdhh}
        odhhPortalUrl={appointment.odhhPortalUrl}
      />
    </Shell>
  );
}
