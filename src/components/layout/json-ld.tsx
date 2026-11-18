/**
 * Renders structured data as a JSON-LD data block. Data blocks are not executed, so the Content
 * Security Policy's script rules do not apply to them and they need no nonce or hash. `<` is escaped
 * so no string in the data can close the element.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
