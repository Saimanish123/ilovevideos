import type { ReactNode } from "react";

/** Root layout is a pass-through; the locale layout owns <html>. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
