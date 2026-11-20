/** Runs the browser support probe in a worker scope (OffscreenCanvas, OPFS sync handles). */
import { probeSupport } from "@/lib/browser-support/probe";

probeSupport().then(
  (facts) => self.postMessage(facts),
  () => self.postMessage(null),
);
