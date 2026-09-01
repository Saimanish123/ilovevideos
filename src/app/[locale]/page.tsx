import { setRequestLocale } from "next-intl/server";
import { ToolCard } from "@/components/tool/tool-card";
import { categories, tools } from "@/tools/registry";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto w-full max-w-(--container-content) px-4 py-16 md:px-8 md:py-24">
      <header className="max-w-[28ch]">
        <h1 className="text-display text-balance">Every video tool. Free. On your device.</h1>
        <p className="mt-6 max-w-[55ch] text-body-lg text-fg-muted">
          Compress, convert, trim and fix videos in your browser. Nothing is uploaded. No account,
          no watermark, no limits.
        </p>
      </header>

      {categories.map((cat) => {
        const list = tools.filter((t) => t.category === cat.id);
        if (list.length === 0) return null;
        return (
          <section key={cat.id} className="mt-24" aria-labelledby={`cat-${cat.id}`}>
            <h2 id={`cat-${cat.id}`} className="text-h2">
              {cat.title}
            </h2>
            <p className="mt-2 text-body text-fg-muted">{cat.description}</p>
            <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((tool) => (
                <li key={tool.slug}>
                  <ToolCard tool={tool} locale={locale} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
