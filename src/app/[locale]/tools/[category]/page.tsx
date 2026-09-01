import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ToolCard } from "@/components/tool/tool-card";
import { routing } from "@/lib/i18n/routing";
import { categories, getToolsByCategory } from "@/tools/registry";
import { CategoryId } from "@/tools/registry/schema";

type Params = { locale: string; category: string };
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return routing.locales.flatMap((locale) => categories.map((c) => ({ locale, category: c.id })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { category } = await params;
  const cat = categories.find((c) => c.id === category);
  if (!cat) return {};
  return { title: `${cat.title} video tools`, description: cat.description };
}

/** Category hub: the middle level of home → hub → tool. Lists every tool in the category. */
export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const { locale, category } = await params;
  setRequestLocale(locale);
  const parsed = CategoryId.safeParse(category);
  if (!parsed.success) notFound();
  const cat = categories.find((c) => c.id === parsed.data);
  if (!cat) notFound();
  const list = getToolsByCategory(parsed.data);

  return (
    <div className="mx-auto w-full max-w-(--container-content) px-4 py-16 md:px-8 md:py-24">
      <h1 className="text-h1">{cat.title}</h1>
      <p className="mt-3 max-w-[60ch] text-body-lg text-fg-muted">{cat.description}</p>
      <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((t) => (
          <li key={t.slug}>
            <ToolCard tool={t} locale={locale} />
          </li>
        ))}
      </ul>
    </div>
  );
}
