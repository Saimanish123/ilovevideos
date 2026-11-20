import type { CompareSource } from "./context";
import { loudnessGains } from "./loudness";
import { follow, release } from "./sync";

export type Side = "before" | "after";

export interface ABHandle {
  set(side: Side): void;
  dispose(): void;
}

/** Click-free switch: each side's gain moves with this time constant (about 20 ms to settle). */
const SWITCH_TC = 0.005;

let shared: AudioContext | undefined;
function context(): AudioContext | undefined {
  if (shared && shared.state !== "closed") return shared;
  const Ctx =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  shared = Ctx ? new Ctx() : undefined;
  return shared;
}

/** An element can be routed into Web Audio once: its node is kept for the element's life. */
const routed = new WeakMap<
  HTMLMediaElement,
  { node: MediaElementAudioSourceNode; gain: GainNode }
>();

function route(ctx: AudioContext, el: HTMLMediaElement) {
  const known = routed.get(el);
  if (known && known.node.context === ctx) return known;
  const node = ctx.createMediaElementSource(el);
  const gain = ctx.createGain();
  node.connect(gain).connect(ctx.destination);
  const r = { node, gain };
  routed.set(el, r);
  return r;
}

/**
 * Before/After on the sound (ADR-0136): the source plays in a hidden element that follows the
 * result's element (compare/sync), both through gains, and a switch moves which one is heard,
 * at the same position. Unless the job is loudness, both are measured (integrated loudness, in the
 * analysis worker) and the louder is turned down to match once the numbers are in. Must be started
 * from a user gesture (the audio context). `onFail` when the source cannot play here.
 */
export function startAB(
  master: HTMLMediaElement,
  compare: CompareSource,
  /** Where the hidden source element lives while the switch does (removed with it). */
  host: HTMLElement,
  onFail: () => void,
) {
  const ctx = context();
  if (!ctx) {
    onFail();
    return undefined;
  }
  void ctx.resume().catch(() => undefined);
  let side: Side = "after";
  let level = { before: 1, after: 1 };
  const url = URL.createObjectURL(compare.source);
  const follower = document.createElement("audio");
  follower.preload = "auto";
  follower.hidden = true;
  follower.dataset.testid = "ab-source";
  follower.src = url;
  host.appendChild(follower);
  let a: ReturnType<typeof route>;
  let b: ReturnType<typeof route>;
  try {
    a = route(ctx, master);
    b = route(ctx, follower);
  } catch {
    release(follower);
    follower.remove();
    URL.revokeObjectURL(url);
    onFail();
    return undefined;
  }
  const apply = (instant = false) => {
    const now = ctx.currentTime;
    const ga = side === "after" ? level.after : 0;
    const gb = side === "before" ? level.before : 0;
    if (instant) {
      a.gain.gain.value = ga;
      b.gain.gain.value = gb;
      return;
    }
    a.gain.gain.setTargetAtTime(ga, now, SWITCH_TC);
    b.gain.gain.setTargetAtTime(gb, now, SWITCH_TC);
  };
  apply(true);
  const unfollow = follow(master, follower, {
    scale: compare.spec.timeScale ?? 1,
    audible: () => side === "before",
  });
  // The page's mute (M, the bar's button) mutes whichever side is heard.
  const onVolume = () => {
    follower.muted = master.muted;
  };
  onVolume();
  // A context the browser suspended (a phone call, the tab in the background) resumes on play.
  const onPlay = () => {
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  };
  master.addEventListener("volumechange", onVolume);
  master.addEventListener("play", onPlay);
  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    side = "after";
    apply(true);
    onFail();
  };
  follower.addEventListener("error", fail);

  const abort = new AbortController();
  if (!compare.spec.keepLoudness) {
    void import("@/tools/workers/sound-analysis-client")
      .then(({ analyzeInWorker }) =>
        Promise.all([
          analyzeInWorker(compare.source, compare.source.name, {
            truePeak: false,
            signal: abort.signal,
          }),
          analyzeInWorker(compare.result, compare.result.name, {
            truePeak: false,
            signal: abort.signal,
          }),
        ]),
      )
      .then(([before, after]) => {
        const g = loudnessGains(before.loudness.integrated, after.loudness.integrated);
        if (!g || abort.signal.aborted) return;
        level = g;
        follower.dataset.match = `${g.before.toFixed(3)} ${g.after.toFixed(3)}`;
        apply();
      })
      // Unmeasured: both play as they are.
      .catch(() => undefined);
  }

  const handle: ABHandle = {
    set(next) {
      if (failed) return;
      side = next;
      onPlay();
      apply();
    },
    dispose() {
      abort.abort();
      unfollow();
      master.removeEventListener("volumechange", onVolume);
      master.removeEventListener("play", onPlay);
      follower.removeEventListener("error", fail);
      // The result keeps playing through its gain (an element cannot leave Web Audio): at unity.
      a.gain.gain.cancelScheduledValues(0);
      a.gain.gain.value = 1;
      b.node.disconnect();
      release(follower);
      follower.remove();
      URL.revokeObjectURL(url);
    },
  };
  return handle;
}
