import { type ReactNode, ViewTransition } from "react";

/**
 * Every navigation between pages runs as a view transition (ADR-0158): a template remounts on each
 * navigation, so the old page leaves ("page" exit) and the new one arrives ("page" enter), and only
 * then: default="none" keeps updates inside a page (a tool's own state changes) out of it. The look
 * is in globals.css: the header holds still, the old page dissolves, the new page plays its entrance.
 * A server component: no script ships for it.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page" exit="page" default="none">
      {children}
    </ViewTransition>
  );
}
