"use client";

import Link from "next/link";
import { useT } from "@/i18n";

export default function ThemeDocsPage() {
  const t = useT();
  return (
    <article className="mx-auto max-w-3xl space-y-8 pb-16">
      <div>
        <Link href="/premium/themes" className="text-sm font-semibold text-teal-700 dark:text-teal-300">
          ← {t("themes.title")}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("themes.docsPageTitle")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t("themes.docsPageIntro")}
        </p>
      </div>

      <Section title={t("themes.docsFlowTitle")} body={t("themes.docsFlowBody")} />
      <Section title={t("themes.docsSettingsTitle")} body={t("themes.docsSettingsBody")} />

      <pre className="overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200" dir="ltr">{`{
  "skin": "atelier" | "pulse" | "lumen" | "cascade",
  "layout": "classic" | "market" | "split" | "funnel",
  "cssVars": { "--store-bg": "#F1F5F9", "--store-primary": "#0D9488" },
  "customCss": ".store-layout-classic main { max-width: 64rem; }",
  "preview": { "accent": "#0D9488", "bg": "#F1F5F9", "label": "Classic" },
  "copy": { "headline": { "en": "Pick a plan", "fa": "یک پلن انتخاب کنید" } }
}`}</pre>

      <Section title={t("themes.docsFnTitle")} body={t("themes.docsFnBody")} />
      <pre className="overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-950" dir="ltr">{`resolveStorefrontSkin(settings)  // atelier | pulse | lumen | cascade | default
resolveStorefrontLayout(settings) // classic | market | split | funnel
skinChrome(skin, layout)          // CSS vars, forceDark, layout
StoreShell                        // website chrome / injects customCss
WelcomeHero({ layout })           // same CTAs, different site structure
ProductCard({ layout })           // card | compact row | split card | glass
CategoryGrid / CategoryPicker     // tiles vs board vs selectable cards
formatProductPrice(product)       // toman / usd from product + store currency
onSelect(product)                 // checkout continues with that plan`}</pre>

      <Section title={t("themes.docsCssTitle")} body={t("themes.docsCssBody")} />
      <Section title={t("themes.docsApiTitle")} body={t("themes.docsApiBody")} />
    </article>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
    </section>
  );
}
