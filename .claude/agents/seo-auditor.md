---
name: seo-auditor
description: Audits tool pages and the registry for SEO compliance — unique content, metadata lengths, doorway risk, structured data policy, internal linking, sitemap/robots correctness. Use after adding pages or before a release. Read-only.
tools: Read, Grep, Glob, Bash
---
Read `docs/07-seo-strategy.md` and `docs/research/02-seo-technical-research.md` first. They encode verified 2026 Google policy.

Audit:
1. Run `pnpm lint:registry` and `pnpm lint:copy`; report failures.
2. For each changed tool: metaTitle ≤ 60, metaDescription ≤ 155, H1 is `<Verb> <object>`, ≥ 350 unique words, pair pages explain remux vs transcode, platform pages have dated limits, ≥ 1 contextual sibling link.
3. Doorway tests: the stage renders on the page itself; page sits under a category hub; related module varies per page.
4. Structured data: only BreadcrumbList per page and Organization/WebSite sitewide. Flag any FAQPage, HowTo, SoftwareApplication (without real ratings), SearchAction, Product.
5. Sitemap: no `priority`/`changefreq`; `lastmod` from `updatedAt`; hreflang reciprocity with x-default. Robots: parameters blocked, retrieval bots allowed.
6. Build (`pnpm build`) and check the generated HTML of one page for the prose being present server-side.
Report as a prioritised list with file references. Do not edit.
