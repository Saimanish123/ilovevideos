import { Link } from "@/lib/i18n/navigation";
import { site } from "@/lib/site";
import { categories, tools } from "@/tools/registry";

export function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-border">
      <div className="mx-auto grid w-full max-w-(--container-content) gap-10 px-4 py-16 md:grid-cols-4 md:px-8">
        {categories.map((cat) => {
          const list = tools.filter((t) => t.category === cat.id);
          if (list.length === 0) return null;
          return (
            <div key={cat.id}>
              <h2 className="text-sm font-medium">{cat.title}</h2>
              <ul className="mt-3 space-y-2">
                {list.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/${t.slug}`} className="text-sm text-fg-muted hover:text-fg">
                      {t.content.en.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="mx-auto flex w-full max-w-(--container-content) items-center justify-between px-4 pb-10 text-xs text-fg-muted md:px-8">
        <span>{site.name}</span>
        <span>Files are processed on your device.</span>
      </div>
    </footer>
  );
}
