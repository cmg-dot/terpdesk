"use client";

import { useMemo, useState } from "react";
import type { OnsiteSignoffInput } from "@/lib/onsiteSignature";

const MIN_NAME_LENGTH = 2;

/**
 * The on-site contact's printed name and drawn signature, for the two hours forms. `input` is what is sent to the server
 * (undefined until both are filled in); the server decides whether the job needs it and checks it again.
 */
export function useOnsiteSignoff() {
  const [printedName, setPrintedName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);

  const complete = printedName.trim().length >= MIN_NAME_LENGTH && Boolean(signature);
  const input = useMemo<OnsiteSignoffInput | undefined>(
    () => (complete && signature ? { printedName: printedName.trim(), signatureDataUrl: signature } : undefined),
    [complete, printedName, signature],
  );

  return { printedName, setPrintedName, setSignature, complete, input };
}

export type OnsiteSignoffState = ReturnType<typeof useOnsiteSignoff>;
