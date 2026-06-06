const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

const newModels = `

// ---------------------------------------------------------
// Premium Features
// ---------------------------------------------------------

enum DomainType {
  PORTAL
  SUBSCRIPTION
  BRAND
}

enum DomainStatus {
  PENDING
  VERIFIED
  SSL_ACTIVE
  SSL_FAILED
  EXPIRED
}

model Domain {
  id        String       @id @default(uuid())
  adminId   String?
  domain    String       @unique
  type      DomainType
  status    DomainStatus @default(PENDING)
  sslMethod String?
  certPath  String?
  keyPath   String?
  errorLogs String?
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  admin     Admin?       @relation(fields: [adminId], references: [id], onDelete: SetNull)
  brand     Brand?       @relation("BrandDomain")
}

model Brand {
  id             String   @id @default(uuid())
  adminId        String
  name           String
  domainId       String?  @unique
  logo           String?
  favicon        String?
  theme          String?
  supportLinks   Json?
  contactMethods Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  admin          Admin    @relation(fields: [adminId], references: [id], onDelete: Cascade)
  domain         Domain?  @relation("BrandDomain", fields: [domainId], references: [id], onDelete: SetNull)
  clients        Client[]
}

model RemoteBackupTarget {
  id          String   @id @default(uuid())
  adminId     String?
  provider    String
  config      Json
  status      String   @default("active")
  createdAt   DateTime @default(now())

  admin       Admin?   @relation(fields: [adminId], references: [id], onDelete: Cascade)
}

model AlertConfiguration {
  id          String   @id @default(uuid())
  adminId     String
  type        String
  channels    Json
  thresholds  Json?
  enabled     Boolean  @default(true)

  admin       Admin    @relation(fields: [adminId], references: [id], onDelete: Cascade)
}
`;

if (!schema.includes('model Brand')) {
  schema += newModels;
}

if (!schema.includes('brandId     String?')) {
  schema = schema.replace(
    '  adminId     String?                         // Nullable for Orphaned / Native System Clients',
    '  adminId     String?                         // Nullable for Orphaned / Native System Clients\n  brandId     String?'
  );
  
  schema = schema.replace(
    '  admin        Admin?              @relation(fields: [adminId], references: [id], onDelete: SetNull)',
    '  admin        Admin?              @relation(fields: [adminId], references: [id], onDelete: SetNull)\n  brand        Brand?              @relation(fields: [brandId], references: [id], onDelete: SetNull)'
  );
}

if (!schema.includes('domains       Domain[]')) {
  schema = schema.replace(
    '  adminInbounds AdminInbound[]',
    '  adminInbounds AdminInbound[]\n  domains       Domain[]\n  brands        Brand[]\n  remoteBackups RemoteBackupTarget[]\n  alerts        AlertConfiguration[]'
  );
}

fs.writeFileSync('prisma/schema.prisma', schema);
