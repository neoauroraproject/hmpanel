const fs = require('fs');
let s = fs.readFileSync('prisma/schema.prisma', 'utf8');

const newModels = `
// ---------------------------------------------------------
// XRAY PRO (Operations Center)
// ---------------------------------------------------------

enum IncidentSeverity {
  INFO
  WARNING
  CRITICAL
}

enum IncidentStatus {
  ACTIVE
  RESOLVED
}

model Incident {
  id          String           @id @default(uuid())
  panelId     String?          
  type        String           
  severity    IncidentSeverity
  status      IncidentStatus   @default(ACTIVE)
  details     Json?
  detectedAt  DateTime         @default(now())
  resolvedAt  DateTime?

  panel       Panel?           @relation(fields: [panelId], references: [id], onDelete: SetNull)
}
`;

s += '\n' + newModels;
s = s.replace(/  syncState   SyncState\?\n  backups     Backup\[\]\n\}/g, "  syncState   SyncState?\n  backups     Backup[]\n  incidents   Incident[]\n}");

fs.writeFileSync('prisma/schema.prisma', s);
