import fs from "fs";
import path from "path";

const root = path.join(import.meta.dirname, "..");
const files = [
  "src/app/(app)/settings/page.tsx",
  "src/app/(app)/settings/SslManagerModal.tsx",
  "src/components/LicenseSettingsCard.tsx",
  "src/app/(app)/clients/page.tsx",
  "src/app/(app)/clients/BulkCreateModal.tsx",
  "src/app/(app)/panels/page.tsx",
  "src/app/(app)/admins/page.tsx",
  "src/app/(app)/traffic/page.tsx",
  "src/app/(app)/cleanup/page.tsx",
  "src/app/(app)/migration/page.tsx",
  "src/app/(app)/diagnostics/page.tsx",
  "src/app/login/page.tsx",
];

function countKeys(obj) {
  let n = 0;
  for (const v of Object.values(obj)) n += typeof v === "string" ? 1 : countKeys(v);
  return n;
}

const en = JSON.parse(fs.readFileSync(path.join(root, "src/i18n/messages/en.json"), "utf8"));
console.log("Catalog keys (en/fa):", countKeys(en));

for (const f of files) {
  const s = fs.readFileSync(path.join(root, f), "utf8");
  const tCount = (s.match(/t\("/g) || []).length;
  console.log(`${path.basename(f)}: ${tCount} t() calls`);
}
