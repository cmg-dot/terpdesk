"use client";

import { useEffect, useState } from "react";
import { Mail, Users } from "lucide-react";
import { getMyTeamContacts } from "@/app/actions/teamContacts";
import type { TeamContact } from "@/app/actions/teamContacts";

/**
 * "Your team" on a booked team job: the other confirmed interpreters' names and emails, so the team can plan arrival, turns and
 * breaks between themselves. Shows nothing until a teammate is booked, and nothing on error.
 */
export function TeamContactsCard({ offerId }: { offerId: string }) {
  const [team, setTeam] = useState<TeamContact[] | null>(null);

  useEffect(() => {
    let live = true;
    getMyTeamContacts(offerId)
      .then((result) => { if (live) setTeam(result.success ? result.team : []); })
      .catch(() => { if (live) setTeam([]); });
    return () => { live = false; };
  }, [offerId]);

  if (team === null) return null;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6" data-team-contacts="">
      <h2 className="flex items-center gap-2 text-[16px] font-semibold text-[var(--ink)]">
        <Users className="h-4 w-4 text-[var(--forest)]" aria-hidden="true" />
        Your team
      </h2>
      {team.length === 0 ? (
        <p className="mt-2 text-[14px] text-[var(--sage)]">Your team interpreter has not been confirmed yet. Their name and email will appear here once they are booked.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {team.map((member) => (
            <li key={`${member.positionOrdinal}-${member.email}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[14px] text-[var(--ink)]">
                <span className="font-medium">{member.name}</span>
                <span className="text-[var(--sage)]"> · Position {member.positionOrdinal}</span>
              </span>
              <a href={`mailto:${member.email}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--forest)] underline underline-offset-2 break-all">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {member.email}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] text-[var(--sage)]">Use this to coordinate with your team. Keep client details out of email.</p>
    </div>
  );
}
