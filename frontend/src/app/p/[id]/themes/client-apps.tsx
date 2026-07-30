"use client";

/**
 * Device-aware VPN client catalog for portal "Add to App" sheets.
 * Download = store/GitHub; Add = deep link (or /app-import bridge).
 */

export type ClientOs = "ios" | "android" | "windows" | "macos" | "other";

export type ClientAppEntry = {
  id: string;
  name: string;
  /** App Store / Play / GitHub releases */
  downloadUrl: string;
  /** Custom-scheme deep link to import subscription */
  addUrl: string;
};

export function detectClientOs(ua?: string): ClientOs {
  const s = String(ua || (typeof navigator !== "undefined" ? navigator.userAgent : "")).toLowerCase();
  if (!s) return "other";
  if (/iphone|ipad|ipod/.test(s)) return "ios";
  if (/android/.test(s)) return "android";
  if (/windows/.test(s)) return "windows";
  if (/macintosh|mac os x/.test(s) && !/iphone|ipad|ipod/.test(s)) return "macos";
  return "other";
}

function shadowrocketUrl(subUrl: string, title: string) {
  let b64: string;
  try {
    b64 = btoa(unescape(encodeURIComponent(subUrl)));
  } catch {
    b64 = btoa(subUrl);
  }
  return `shadowrocket://add/sub://${b64}?title=${encodeURIComponent(title)}`;
}

function happUrl(subUrl: string) {
  return `happ://import/${encodeURIComponent(subUrl)}`;
}

/** Build deep-link add URL for a known app id. */
export function buildAppAddUrl(
  appId: string,
  subUrl: string,
  brandName: string,
): string {
  switch (appId) {
    case "v2rayng":
      return `v2rayng://install-sub?url=${encodeURIComponent(subUrl)}`;
    case "v2rayn":
      return `v2rayn://install-sub?url=${encodeURIComponent(subUrl)}`;
    case "hiddify":
      return `hiddify://install-sub?url=${encodeURIComponent(subUrl)}`;
    case "v2box":
      return `v2box://install-sub?url=${encodeURIComponent(subUrl)}&name=${encodeURIComponent(brandName)}`;
    case "streisand":
      return `streisand://import/${encodeURIComponent(subUrl)}`;
    case "happ":
      return happUrl(subUrl);
    case "shadowrocket":
      return shadowrocketUrl(subUrl, brandName);
    default:
      return subUrl;
  }
}

const DOWNLOAD = {
  v2rayn: "https://github.com/2dust/v2rayN/releases",
  hiddify: "https://github.com/hiddify/hiddify-app/releases",
  v2rayng: "https://github.com/2dust/v2rayNG/releases",
  v2box: "https://apps.apple.com/app/v2box-v2ray-client/id6446814928",
  streisand: "https://apps.apple.com/app/streisand/id6450534064",
  happ: "https://apps.apple.com/app/happ-proxy-utility/id6504287215",
  shadowrocket: "https://apps.apple.com/app/shadowrocket/id932747118",
} as const;

export function appsForOs(os: ClientOs, subUrl: string, brandName: string): ClientAppEntry[] {
  const mk = (id: keyof typeof DOWNLOAD, name: string): ClientAppEntry => ({
    id,
    name,
    downloadUrl: DOWNLOAD[id],
    addUrl: buildAppAddUrl(id, subUrl, brandName),
  });

  switch (os) {
    case "windows":
      return [mk("v2rayn", "v2rayN"), mk("hiddify", "Hiddify")];
    case "ios":
      return [
        mk("v2box", "V2Box"),
        mk("streisand", "Streisand"),
        mk("happ", "Happ"),
        mk("shadowrocket", "Shadowrocket"),
      ];
    case "android":
      return [mk("v2rayng", "v2rayNG"), mk("hiddify", "Hiddify")];
    case "macos":
      return [mk("hiddify", "Hiddify"), mk("v2box", "V2Box")];
    default:
      return [
        mk("v2rayng", "v2rayNG"),
        mk("hiddify", "Hiddify"),
        mk("v2box", "V2Box"),
        mk("streisand", "Streisand"),
        mk("happ", "Happ"),
        mk("shadowrocket", "Shadowrocket"),
        mk("v2rayn", "v2rayN"),
      ];
  }
}

/** HTTPS bridge for custom schemes (Telegram / some browsers). */
export function appImportBridgeUrl(addUrl: string): string {
  if (typeof window === "undefined") return addUrl;
  try {
    const u = new URL(addUrl);
    const scheme = u.protocol.replace(":", "").toLowerCase();
    if (["http", "https"].includes(scheme)) return addUrl;
    return `${window.location.origin}/app-import?to=${encodeURIComponent(addUrl)}`;
  } catch {
    return addUrl;
  }
}

export function ClientAppsSheet({
  open,
  onClose,
  systemUrl,
  brandName,
  title,
  cancelLabel,
  downloadLabel = "Download",
  addLabel = "Add",
  subtitle,
  panelClassName = "bg-white text-zinc-900",
  os,
}: {
  open: boolean;
  onClose: () => void;
  systemUrl: string;
  brandName: string;
  title: string;
  cancelLabel: string;
  downloadLabel?: string;
  addLabel?: string;
  subtitle?: string;
  panelClassName?: string;
  /** Override detected OS (tests) */
  os?: ClientOs;
}) {
  if (!open) return null;
  const detected = os || detectClientOs();
  const apps = appsForOs(detected, systemUrl, brandName);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className={`relative z-10 w-full max-w-md rounded-t-3xl p-5 shadow-2xl sm:rounded-3xl ${panelClassName}`}
      >
        <h3 className="mb-1 text-center text-lg font-bold">{title}</h3>
        {subtitle ? (
          <p className="mb-4 text-center text-xs opacity-60">{subtitle}</p>
        ) : (
          <p className="mb-4 text-center text-xs opacity-60 capitalize">{detected}</p>
        )}
        <div className="space-y-2.5">
          {apps.map((app) => (
            <div
              key={app.id}
              className="flex items-center gap-2 rounded-2xl border border-black/10 bg-black/[0.03] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 truncate text-sm font-semibold">{app.name}</div>
              <a
                href={app.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-xl border border-black/10 px-3 py-1.5 text-xs font-semibold opacity-80 hover:opacity-100"
              >
                {downloadLabel}
              </a>
              <a
                href={appImportBridgeUrl(app.addUrl)}
                className="shrink-0 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white"
              >
                {addLabel}
              </a>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-2xl bg-zinc-900 py-3 text-sm font-semibold text-white"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
