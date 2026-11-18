"use client";

import { useEffect, useState } from "react";

/**
 * Whether the user asked for reduced motion, kept current when the setting changes. For motion
 * drawn from script (the level meter, the waveform), which the global CSS rule cannot reach.
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}
