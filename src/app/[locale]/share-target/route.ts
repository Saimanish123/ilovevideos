/**
 * Where the installed app's Share menu posts files (manifest `share_target`). The service worker
 * answers this itself and keeps the files on the device (public/sw.js); this route only runs when no
 * service worker is active yet, and then says so on the chooser rather than failing with a 405.
 * The request body is not read.
 */
export function POST(request: Request) {
  return Response.redirect(new URL("/share?files=0", request.url), 303);
}
