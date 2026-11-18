import { isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * Serialises an illustration to an SVG string with concrete colours, so the same drawing the tool
 * card shows can be rendered into its OG image at build time (design system §7.1 "Reuse"). The
 * illustrations are pure function components of SVG primitives, so walking the element tree is
 * enough; no DOM or react-dom/server is involved. Colours: `currentColor` → subject, the fg-muted
 * and bg-raised token references → their build-time values.
 */

/** React prop → SVG attribute. SVG keeps a few camelCase names (viewBox); the rest are kebab-case. */
const attrName = (k: string) =>
  k === "className"
    ? "class"
    : k === "viewBox"
      ? k
      : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const escapeXml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function walk(node: ReactNode, colours: Record<string, string>): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return escapeXml(String(node));
  if (Array.isArray(node)) return node.map((n) => walk(n, colours)).join("");
  if (!isValidElement(node)) return "";
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === "function") {
    return walk((el.type as (p: unknown) => ReactNode)(el.props), colours);
  }
  if (typeof el.type !== "string") return walk(el.props.children as ReactNode, colours);
  const attrs = Object.entries(el.props)
    .filter(([k, v]) => k !== "children" && v !== undefined && v !== false && !k.startsWith("aria"))
    .map(([k, v]) => {
      let value = String(v);
      for (const [from, to] of Object.entries(colours)) value = value.split(from).join(to);
      return ` ${attrName(k)}="${escapeXml(value)}"`;
    })
    .join("");
  const tag = el.type;
  const xmlns = tag === "svg" ? ' xmlns="http://www.w3.org/2000/svg"' : "";
  return `<${tag}${xmlns}${attrs}>${walk(el.props.children as ReactNode, colours)}</${tag}>`;
}

export function illustrationToSvg(
  element: ReactElement,
  colours: { subject: string; muted: string; raised: string },
): string {
  return walk(element, {
    currentColor: colours.subject,
    "var(--color-fg-muted)": colours.muted,
    "var(--color-bg-raised)": colours.raised,
  });
}
