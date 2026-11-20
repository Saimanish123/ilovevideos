/**
 * Keeps a second media element (the source) at the same moment as the one the user drives (the
 * result): play, pause, seek, scrub and rate follow at once, and while playing a small rate nudge
 * holds the two together. The follower never drives anything back. Pure parts are exported for
 * tests; `follow` is the DOM part.
 */

/** Closer than this, a correction in progress ends: the follower plays at the master's rate. */
export const DEADBAND_S = 0.004;
/**
 * A correction starts only past this. Each rate change makes the browser re-time the element and
 * costs it about 20 ms (measured in Chromium), so chasing a few milliseconds made things worse.
 */
export const START_S = 0.012;
/** Further than this apart, the follower seeks instead of catching up (a stall, a dropped burst). */
export const HARD_S = 0.25;
/** Share of the rate changed per second of drift. 20 ms behind plays 6 % faster until caught up. */
const GAIN = 3;
/** How often the drift is read while playing. */
const TICK_MS = 50;
/**
 * A rate change makes the browser re-time the element's playback, which itself costs a few
 * milliseconds; changing it every tick stalled the follower further (measured). So the rate moves
 * in whole percent and at most this often, except straight back to the master's rate.
 */
const RATE_HOLD_MS = 250;
/** Largest nudge for a muted follower (a picture: invisible) and for a heard one (pitch). */
export const MAX_SHARE_MUTED = 0.15;
export const MAX_SHARE_HEARD = 0.03;

/**
 * The follower's rate for a measured drift (seconds; positive = the follower is ahead). Capped to
 * `maxShare` of the base rate either way; a heard follower gets a smaller cap, so a correction
 * never shifts its pitch audibly.
 */
export function correctedRate(
  base: number,
  drift: number,
  maxShare: number,
  deadband = DEADBAND_S,
): number {
  if (!Number.isFinite(drift) || Math.abs(drift) < deadband) return base;
  const share = Math.max(-maxShare, Math.min(maxShare, drift * GAIN));
  return base * (1 - share);
}

/**
 * Where the follower should be for a master time: `scale` maps result time to source time (a
 * result at 2× speed shows the source's second 4 at its second 2), kept inside the follower's
 * length.
 */
export function followerTime(masterTime: number, scale: number, duration: number): number {
  const t = Math.max(0, masterTime * scale);
  return Number.isFinite(duration) && duration > 0 ? Math.min(duration, t) : t;
}

export interface FollowOptions {
  /** Source seconds per result second (speed pages); 1 elsewhere. */
  scale?: number;
  /** True while the follower is the one being heard (sound A/B): smaller rate nudges. */
  audible?: () => boolean;
}

/**
 * Makes `follower` track `master` until the returned function is called. The follower should be
 * muted unless its sound is routed (sound A/B).
 */
export function follow(
  master: HTMLMediaElement,
  follower: HTMLMediaElement,
  { scale = 1, audible = () => false }: FollowOptions = {},
): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let seeking = false;
  let seekStarted = 0;
  /** The last seek's latency, as a lead for the next one while playing (capped). */
  let latency = 0;
  let ema = 0;
  let lastRate = Number.NaN;
  let rateAt = 0;

  const base = () => master.playbackRate * scale;
  const setRate = (r: number, force = false) => {
    const exact = Math.abs(r - base()) < 1e-9;
    const q = exact ? r : Math.round(r * 100) / 100;
    if (q === lastRate || !(q > 0)) return;
    const now = performance.now();
    if (!force && !exact && now - rateAt < RATE_HOLD_MS) return;
    try {
      follower.playbackRate = q;
      lastRate = q;
      rateAt = now;
    } catch {
      // A rate the browser refuses (out of its range): keep the last one; the hard seek still holds.
    }
  };
  const seekNow = () => {
    // While playing, aim where the master will be when the seek lands.
    const lead = master.paused ? 0 : Math.min(0.3, latency) * master.playbackRate;
    const t = followerTime(master.currentTime + lead, scale, follower.duration);
    ema = 0;
    if (Math.abs(follower.currentTime - t) < 0.001) return;
    seeking = true;
    seekStarted = performance.now();
    follower.currentTime = t;
  };
  const onFollowerSeeked = () => {
    if (seeking) latency = (performance.now() - seekStarted) / 1000;
    seeking = false;
  };
  const tick = () => {
    if (master.paused || seeking || follower.readyState < 2) return;
    const drift = follower.currentTime - followerTime(master.currentTime, scale, follower.duration);
    if (Math.abs(drift) > HARD_S) {
      seekNow();
      return;
    }
    ema = ema * 0.5 + drift * 0.5;
    const correcting = lastRate !== base();
    setRate(
      correctedRate(
        base(),
        ema,
        audible() ? MAX_SHARE_HEARD : MAX_SHARE_MUTED,
        correcting ? DEADBAND_S : START_S,
      ),
    );
  };
  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const onPlay = () => {
    setRate(base(), true);
    // Paused, the two already show the same frame: start together. Only a follower left
    // elsewhere (still loading, or the master seeked while it could not) is moved first.
    const off = follower.currentTime - followerTime(master.currentTime, scale, follower.duration);
    if (Math.abs(off) > 0.02) {
      latency = 0;
      seekNow();
    }
    void follower.play().catch(() => undefined);
    stop();
    timer = setInterval(tick, TICK_MS);
  };
  const onPause = () => {
    stop();
    follower.pause();
    latency = 0;
    seekNow();
  };
  const onWaiting = () => follower.pause();
  const onPlaying = () => {
    if (!master.paused && follower.paused) {
      seekNow();
      void follower.play().catch(() => undefined);
    }
  };
  const onSeek = () => seekNow();
  const onRate = () => setRate(base(), true);

  master.addEventListener("play", onPlay);
  master.addEventListener("pause", onPause);
  master.addEventListener("ended", onPause);
  master.addEventListener("waiting", onWaiting);
  master.addEventListener("playing", onPlaying);
  master.addEventListener("seeking", onSeek);
  master.addEventListener("seeked", onSeek);
  master.addEventListener("ratechange", onRate);
  follower.addEventListener("seeked", onFollowerSeeked);
  // The follower may still be loading: place it once it can seek.
  const onReady = () => {
    seekNow();
    if (!master.paused) onPlay();
  };
  follower.addEventListener("loadedmetadata", onReady);
  setRate(base(), true);
  if (follower.readyState >= 1) onReady();

  return () => {
    stop();
    master.removeEventListener("play", onPlay);
    master.removeEventListener("pause", onPause);
    master.removeEventListener("ended", onPause);
    master.removeEventListener("waiting", onWaiting);
    master.removeEventListener("playing", onPlaying);
    master.removeEventListener("seeking", onSeek);
    master.removeEventListener("seeked", onSeek);
    master.removeEventListener("ratechange", onRate);
    follower.removeEventListener("seeked", onFollowerSeeked);
    follower.removeEventListener("loadedmetadata", onReady);
    follower.pause();
  };
}

/**
 * Lets go of a media element's decoder and buffers at once (removing it from the page alone can
 * leave them until garbage collection, which matters with two 4K decoders).
 */
export function release(el: HTMLMediaElement | null | undefined) {
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
}
