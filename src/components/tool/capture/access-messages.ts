/**
 * The two sentences for a refused microphone, camera or screen: what happened, then what to do,
 * worded for this device (macOS screen permission, iOS site settings, click or tap). Loaded only
 * when a refusal happens (ADR-0104), so the recorder pages' first load does not carry the copy for
 * every case. No network access.
 */
import { AccessError, thisOs } from "./media";

const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const press = () =>
  typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? "Tap" : "Click";

/** What happened, and what to do (without its full stop, so another way out can follow). */
function sentences(e: AccessError): [string, string] {
  const d = e.device;
  if (d === "screen") {
    switch (e.failure) {
      case "denied":
        return thisOs() === "mac"
          ? [
              "Screen recording is off for this browser in System Settings.",
              "Turn it on under Privacy & Security › Screen & System Audio Recording, then quit and reopen the browser",
            ]
          : [
              "Screen recording is blocked for this browser.",
              "Allow it in your system's privacy settings for screen recording, then reload the page",
            ];
      case "unsupported":
        return [
          "This browser cannot record the screen.",
          "Use a current Chrome, Edge, Firefox or Safari on a computer",
        ];
      default:
        return [
          "The screen could not be shared.",
          "Try again, or choose a different window or tab",
        ];
    }
  }
  switch (e.failure) {
    case "denied":
      return [
        `The ${d} is blocked for this site.`,
        isIos()
          ? `Tap aA in the address bar, then Website Settings, and allow the ${d}`
          : `${press()} the icon in the address bar to allow it`,
      ];
    case "missing":
      return [`No ${d} was found.`, "Connect one and try again"];
    case "busy":
      return [
        `The ${d} is in use by another app or cannot be opened.`,
        "Close that app and try again",
      ];
    case "unsupported":
      return [
        `This browser cannot use a ${d} here.`,
        "Use a current Chrome, Edge, Firefox or Safari",
      ];
    default:
      return [`The ${d} could not be opened.`, "Try again"];
  }
}

/**
 * The message for any failure while opening a device: a refusal's own two sentences, or the
 * error's. `orElse` joins the second sentence as another way out ("turn the camera bubble off").
 */
export function messageFor(e: unknown, orElse?: string): string {
  if (!(e instanceof AccessError)) return String((e as Error)?.message ?? e);
  const [what, todo] = sentences(e);
  return `${what} ${todo}${orElse ? `, or ${orElse}` : ""}.`;
}
