/** Paths that must never hard-redirect guests to /login on 401. */
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/p",
  "/shop",
  "/portal",
  "/track",
  "/s",
];

export function isPublicAppPath(pathname?: string | null) {
  const path = String(pathname || "");
  if (!path) return false;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
