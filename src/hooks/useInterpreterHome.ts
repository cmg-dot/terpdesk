"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { fetchInterpreterOffers } from "@/app/actions/getInterpreterOffers";
import { td_availability_view } from "@/app/actions/availability";
import type { HomeOffer } from "@/components/interpreter/HomeOfferCard";
import { useInterpreterJobs } from "@/context/InterpreterJobsContext";
import { useGlobalState } from "@/context/GlobalContext";
import { useConnectedAgencyCount } from "@/hooks/useConnectedAgencyCount";
import type { AcceptAnswersInput } from "@/lib/acceptAnswers";

/** The browser's remembered time zone for the interpreter, else Pacific (what the page showed before this moved out of it). */
function rememberedZone(userId: string | undefined): string {
  if (typeof window !== "undefined") {
    try {
      const storedTz = localStorage.getItem("terpdesk_interpreter_timezone");
      if (storedTz) return storedTz;
      const storedUserTz = localStorage.getItem(`terpdesk_timezone_${userId || "terp-1"}`);
      if (storedUserTz) return storedUserTz;
      const storedAvail = localStorage.getItem("terpdesk_availability");
      if (storedAvail) {
        const parsed = JSON.parse(storedAvail);
        if (parsed?.baseTimezone) return parsed.baseTimezone;
      }
    } catch {
      // Unreadable browser storage: fall through to the default.
    }
  }
  return "America/Los_Angeles";
}

/**
 * Everything the interpreter Home keeps in state: the pending offers, the hours drafts, the clock, the profile zone and the
 * accept / decline flow (moved out of the page unchanged so the page stays a layout).
 */
export function useInterpreterHome() {
  const { jobs, acceptJobOffer, declineOffer } = useInterpreterJobs();
  const { currentUser } = useGlobalState();
  const { data: session } = useSession();
  const connectedAgencyCount = useConnectedAgencyCount(session?.user?.id);
  const [offers, setOffers] = React.useState<HomeOffer[]>([]);
  const [currentTime, setCurrentTime] = React.useState<number>(Date.now());
  const [serviceRecords, setServiceRecords] = React.useState<Record<string, unknown>[]>([]);
  const [acceptError, setAcceptError] = React.useState<string | null>(null);
  const [profileTimezone, setProfileTimezone] = React.useState<string>(() => rememberedZone(currentUser?.id));

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    const loadRecords = () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("terpdesk_service_records");
        if (stored) {
          try {
            setServiceRecords(JSON.parse(stored));
          } catch {
            console.error("[interpreter-home page] operation failed");
          }
        }
      }
    };
    loadRecords();
    window.addEventListener("storage", loadRecords);
    return () => window.removeEventListener("storage", loadRecords);
  }, []);

  React.useEffect(() => {
    const loadTz = () => {
      if (typeof window !== "undefined") {
        const storedTz = localStorage.getItem("terpdesk_interpreter_timezone");
        if (storedTz) setProfileTimezone(storedTz);
      }
    };
    loadTz();
    if (currentUser?.id) {
      td_availability_view(currentUser.id)
        .then((data) => {
          if (data.profile?.timeZone) setProfileTimezone(data.profile.timeZone);
        })
        .catch(() => console.error("[interpreter-home page] request failed"));
    }
    window.addEventListener("storage", loadTz);
    return () => window.removeEventListener("storage", loadTz);
  }, [currentUser?.id]);

  const reloadOffers = React.useCallback(() => {
    if (currentUser?.email) {
      fetchInterpreterOffers(currentUser.email).then(setOffers).catch(() => console.error("[interpreter-home page] request failed"));
    }
  }, [currentUser?.email]);
  React.useEffect(reloadOffers, [reloadOffers]);

  const [isPending, startTransition] = React.useTransition();
  const [actingOfferId, setActingOfferId] = React.useState<string | null>(null);

  // Accept first asks "Do you need travel time?" (AcceptOfferDialog); the offer is accepted with the answers.
  const [acceptingOffer, setAcceptingOffer] = React.useState<{ id: string; title: string } | null>(null);
  const handleAcceptOffer = (offer: HomeOffer) => {
    setAcceptError(null);
    setAcceptingOffer({ id: String(offer.id), title: String(offer.title || "this job") });
  };
  // Decline (after the card's own "Decline this offer?" confirmation): declineOffer tells the agency and closes the offer; the card
  // then leaves the list. A refusal (expired, withdrawn) rejects, the card shows it, and the list is reloaded to match the database.
  const handleDeclineOffer = async (offerId: string) => {
    try {
      await declineOffer(offerId);
    } catch (err) {
      reloadOffers();
      throw err;
    }
    setOffers((prev) => prev.filter((o) => o.id !== offerId));
  };
  const confirmAccept = (answers: AcceptAnswersInput) => {
    const offer = acceptingOffer;
    if (!offer) return;
    setAcceptError(null);
    setActingOfferId(offer.id);
    startTransition(async () => {
      try {
        await acceptJobOffer(offer.id, answers);
        setOffers((prev) => prev.filter((o) => o.id !== offer.id));
        setAcceptingOffer(null);
      } catch (err) {
        console.error("[interpreter-home page] operation failed");
        setAcceptError((err instanceof Error && err.message) || "This offer has expired and can no longer be accepted.");
        reloadOffers();
      } finally {
        setActingOfferId(null);
      }
    });
  };

  return {
    jobs, offers, currentTime, serviceRecords, profileTimezone, connectedAgencyCount,
    acceptError, setAcceptError, isPending, actingOfferId, acceptingOffer, setAcceptingOffer,
    handleAcceptOffer, handleDeclineOffer, confirmAccept,
  };
}
