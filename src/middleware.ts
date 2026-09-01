import createMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Skip static files, API routes, wasm assets
  matcher: ["/((?!api|_next|_vercel|wasm|.*\\..*).*)"],
};
