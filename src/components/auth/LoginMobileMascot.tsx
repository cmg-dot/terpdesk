"use client";

import { motion } from "framer-motion";
import { TerpMascot } from "@/components/auth/TerpMascot";
import { MascotSpeechBubble } from "@/components/auth/MascotSpeechBubble";

/**
 * The owl on phones, peeking over the top of the sign-in card. When it has something to say, it slides aside for its speech
 * bubble; the row grows to fit the bubble, so the bubble never covers the form.
 */
export const LoginMobileMascot = () => (
  <div className="-mb-3 mt-1 flex w-full items-end justify-center gap-3">
    {/* Clipped at the bottom only, just below the tablet (the card hides the rest); a pointing wing may reach out sideways. */}
    <motion.div layout="position" aria-hidden="true" className="h-[106px] w-[100px] shrink-0 overflow-y-clip">
      <TerpMascot className="h-auto w-full" />
    </motion.div>
    <MascotSpeechBubble layout="compact" />
  </div>
);
