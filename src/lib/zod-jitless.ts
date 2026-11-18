/**
 * Turns off zod's JIT in the browser before zod loads. The JIT probes `new Function("")` once;
 * the site's Content Security Policy forbids eval, so the probe fails and is caught, but browsers
 * still report it as a CSP violation (and Lighthouse flags it). zod reads this global when its core
 * module is evaluated, so it must run first: see zod-browser.ts.
 */
const g = globalThis as { __zod_globalConfig?: Record<string, unknown> };
g.__zod_globalConfig = { ...g.__zod_globalConfig, jitless: true };

export {};
