"use client";

import { ArrowRight } from "lucide-react";
import { useBooking } from "@/components/public/book/BookingContext";

/** "Request <name>": puts the name in the form's Preferred interpreter field and scrolls to the form (the form moves focus there). */
export function RequestInterpreterButton({ name }: { name: string }) {
  const { requestInterpreter } = useBooking();
  const onClick = () => {
    requestInterpreter(name);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("request")?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Request ${name}`}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--forest)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-hover)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.4)] focus:ring-offset-2"
    >
      Request {name.split(" ")[0]}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
