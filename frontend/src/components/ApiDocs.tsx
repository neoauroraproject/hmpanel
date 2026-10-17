"use client";

import { Copy } from "lucide-react";
import { Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { usePremiumModules } from "@/hooks/usePremiumModules";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Endpoint = { id: string; method: Method; path: string; scope?: string; superOnly?: boolean; body?: string };
type Group = { id: string; module?: string; endpoints: Endpoint[] };

const CORE: Group[] = [
  {
    id: "core",
    endpoints: [
      { id: "account", method: "GET", path: "/v1/account", scope: "account.read" },
      { id: "stats", method: "GET", path: "/v1/stats", scope: "stats.read" },
      { id: "inbounds", method: "GET", path: "/v1/inbounds", scope: "inbounds.read" },
      { id: "clientsSearch", method: "GET", path: "/v1/clients/search?page=1&limit=50&search=", scope: "clients.read" },
      { id: "clientsLookup", method: "GET", path: "/v1/clients/lookup?key=<subToken|subId|email>", scope: "clients.read" },
      { id: "clientGet", method: "GET", path: "/v1/clients/:id", scope: "clients.read" },
      { id: "clientCreate", method: "POST", path: "/v1/clients", scope: "clients.write" },
      { id: "clientPatch", method: "PATCH", path: "/v1/clients/:id", scope: "clients.write" },
      { id: "clientDelete", method: "DELETE", path: "/v1/clients/:id", scope: "clients.write" },
      {
        id: "clientRenew",
        method: "POST",
        path: "/v1/clients/:id/renew",
        scope: "clients.renew",
        body: '{"days":30,"totalGb":50,"resetUsage":true}',
      },
      { id: "clientReset", method: "POST", path: "/v1/clients/:id/reset-usage", scope: "clients.renew" },
      { id: "traffic", method: "GET", path: "/v1/traffic", scope: "traffic.read" },
    ],
  },
];

const PREMIUM: Group[] = [
  {
    id: "premium",
    endpoints: [{ id: "premiumOverview", method: "GET", path: "/v1/premium" }],
  },
  {
    id: "store",
    module: "store",
    endpoints: [
      { id: "store", method: "GET", path: "/v1/premium/store", scope: "store.read" },
      { id: "storePayment", method: "GET", path: "/v1/premium/store/payment?surface=store", scope: "store.read" },
      { id: "storeDashboard", method: "GET", path: "/v1/premium/store/dashboard", scope: "store.read" },
      { id: "storeCategories", method: "GET", path: "/v1/premium/store/categories", scope: "store.read" },
      { id: "storeProducts", method: "GET", path: "/v1/premium/store/products?kind=VPN", scope: "store.read" },
      { id: "storeOrders", method: "GET", path: "/v1/premium/store/orders?status=UNDER_REVIEW&page=1", scope: "store.read" },
      { id: "storeOrder", method: "GET", path: "/v1/premium/store/orders/:id", scope: "store.read" },
      {
        id: "storeOrderCreate",
        method: "POST",
        path: "/v1/premium/store/orders",
        scope: "store.write",
        body: '{"productId":"…","name":"Reza","telegram":"@reza","paymentMethod":"MANUAL_BANK","receiptText":"1234"}',
      },
      { id: "storeOrderApprove", method: "POST", path: "/v1/premium/store/orders/:id/approve", scope: "store.write" },
      {
        id: "storeOrderReject",
        method: "POST",
        path: "/v1/premium/store/orders/:id/reject",
        scope: "store.write",
        body: '{"reason":"…"}',
      },
      { id: "storeCustomers", method: "GET", path: "/v1/premium/store/customers?search=", scope: "store.read" },
      { id: "storeCustomer", method: "GET", path: "/v1/premium/store/customers/:id", scope: "store.read" },
    ],
  },
  {
    id: "agency",
    module: "admin-recharge",
    endpoints: [
      { id: "agencyCatalog", method: "GET", path: "/v1/premium/agency/catalog", scope: "agency.read" },
      { id: "agencyOrders", method: "GET", path: "/v1/premium/agency/orders?status=PAYMENT_SUBMITTED", scope: "agency.read" },
      { id: "agencyOrder", method: "GET", path: "/v1/premium/agency/orders/:id", scope: "agency.read" },
      {
        id: "agencyOrderCreate",
        method: "POST",
        path: "/v1/premium/agency/orders",
        scope: "agency.write",
        body: '{"planId":"…","paymentMethod":"manual_bank","receiptText":"1234"}',
      },
      {
        id: "agencyReceipt",
        method: "POST",
        path: "/v1/premium/agency/orders/:id/receipt",
        scope: "agency.write",
        body: '{"receiptText":"1234"}',
      },
      { id: "agencyApprove", method: "POST", path: "/v1/premium/agency/orders/:id/approve", scope: "agency.write", superOnly: true },
      {
        id: "agencyReject",
        method: "POST",
        path: "/v1/premium/agency/orders/:id/reject",
        scope: "agency.write",
        superOnly: true,
        body: '{"reason":"…"}',
      },
    ],
  },
  {
    id: "external",
    module: "external-panels",
    endpoints: [
      { id: "extAccess", method: "GET", path: "/v1/premium/external-panels", scope: "external.read" },
      { id: "extList", method: "GET", path: "/v1/premium/external-panels/pasarguard/clients?limit=50", scope: "external.read" },
      { id: "extGet", method: "GET", path: "/v1/premium/external-panels/pasarguard/clients/:username", scope: "external.read" },
      {
        id: "extOutput",
        method: "GET",
        path: "/v1/premium/external-panels/pasarguard/clients/:username/output",
        scope: "external.read",
      },
      {
        id: "extCreate",
        method: "POST",
        path: "/v1/premium/external-panels/pasarguard/clients",
        scope: "external.write",
        body: '{"username":"ali-01","dataLimitGb":50,"expiryDays":30}',
      },
      {
        id: "extPatch",
        method: "PATCH",
        path: "/v1/premium/external-panels/pasarguard/clients/:username",
        scope: "external.write",
        body: '{"dataLimitGb":100}',
      },
      { id: "extDelete", method: "DELETE", path: "/v1/premium/external-panels/pasarguard/clients/:username", scope: "external.write" },
    ],
  },
  {
    id: "payg",
    module: "store-payg",
    endpoints: [
      { id: "paygList", method: "GET", path: "/v1/premium/payg/subscriptions", scope: "payg.read" },
      { id: "paygGet", method: "GET", path: "/v1/premium/payg/subscriptions/:id", scope: "payg.read" },
      { id: "paygUsage", method: "GET", path: "/v1/premium/payg/subscriptions/:id/usage", scope: "payg.read" },
      { id: "paygSuspend", method: "POST", path: "/v1/premium/payg/subscriptions/:id/suspend", scope: "payg.write" },
      { id: "paygResume", method: "POST", path: "/v1/premium/payg/subscriptions/:id/resume", scope: "payg.write" },
    ],
  },
  {
    id: "templates",
    module: "client-templates",
    endpoints: [
      { id: "tplList", method: "GET", path: "/v1/premium/client-templates", scope: "templates.read" },
      { id: "tplPools", method: "GET", path: "/v1/premium/client-templates/pools", scope: "templates.read" },
    ],
  },
];

const METHOD_STYLE: Record<Method, string> = {
  GET: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  POST: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PATCH: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  DELETE: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

function curlFor(origin: string, e: Endpoint) {
  const url = `${origin}/api${e.path}`;
  const parts = [`curl -s${e.method === "GET" ? "" : ` -X ${e.method}`} "${url}"`, `  -H "Authorization: Bearer hmp_…"`];
  if (e.body) parts.push(`  -H "Content-Type: application/json"`, `  -d '${e.body}'`);
  return parts.join(" \\\n");
}

/** Endpoint reference in Settings → API: core routes, then premium routes for this admin's modules. */
export function ApiDocs({ premiumAvailable }: { premiumAvailable: boolean }) {
  const t = useT();
  const toast = useToast((s) => s.push);
  const isSuper = useAuth((s) => s.admin?.role) === "SUPER_ADMIN";
  const { data: modules = [] } = usePremiumModules({ enabled: premiumAvailable });
  const mine = new Set(modules.filter((m) => m.enabled && m.status !== "disabled").map((m) => m.id));
  const origin = typeof window === "undefined" ? "https://panel.example.com" : window.location.origin;

  const copy = (e: Endpoint) => {
    void navigator.clipboard.writeText(curlFor(origin, e));
    toast(t("apiKeys.copied"));
  };

  const renderGroup = (g: Group) => {
    const hasModule = !g.module || mine.has(g.module);
    return (
      <section key={g.id} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{t(`apiDocs.group_${g.id}`)}</h3>
          {g.module && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                hasModule
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-zinc-500/10 text-zinc-500"
              }`}
            >
              {hasModule ? t("apiDocs.moduleOn") : t("apiDocs.moduleOff")}
            </span>
          )}
        </div>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {g.endpoints.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-3 py-2 text-sm">
              <span className={`mt-0.5 w-16 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-xs ${METHOD_STYLE[e.method]}`}>
                {e.method}
              </span>
              <div className="min-w-0 flex-1">
                <code dir="ltr" className="block break-all text-xs text-zinc-800 dark:text-zinc-100">
                  {e.path}
                </code>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {t(`apiDocs.ep_${e.id}`)}
                  {e.scope && (
                    <>
                      {" · "}
                      <code dir="ltr">{e.scope}</code>
                    </>
                  )}
                  {e.superOnly && ` · ${t("apiDocs.superOnly")}`}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("apiDocs.copyCurl")}
                title={t("apiDocs.copyCurl")}
                onClick={() => copy(e)}
                className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100"
              >
                <Copy size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("apiDocs.title")}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {t("apiDocs.hint")} <code dir="ltr" className="text-xs">{origin}/api</code>
        </p>
      </div>

      {CORE.map(renderGroup)}

      <div className="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-100">{t("apiDocs.premiumTitle")}</h3>
        {premiumAvailable ? (
          <>
            <p className="text-sm text-zinc-500">{t(isSuper ? "apiDocs.premiumGatesSuper" : "apiDocs.premiumGates")}</p>
            {PREMIUM.map(renderGroup)}
          </>
        ) : (
          <p className="text-sm text-zinc-500">{t("apiDocs.premiumOff")}</p>
        )}
      </div>
    </Card>
  );
}
