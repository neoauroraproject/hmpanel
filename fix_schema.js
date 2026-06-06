const fs = require('fs');

let cleanState = `
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
  storeProfile StoreProfile?
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

// ---------------------------------------------------------
// Premium Storefront
// ---------------------------------------------------------

model StoreProfile {
  id                  String   @id @default(uuid())
  adminId             String   @unique
  slug                String   @unique
  domainId            String?  @unique
  title               String   @default("Premium VPN Store")
  description         String?
  logo                String?
  paymentInstructions String?
  bankCardNumber      String?
  bankAccountInfo     String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  admin               Admin    @relation(fields: [adminId], references: [id], onDelete: Cascade)
  domain              Domain?  @relation(fields: [domainId], references: [id], onDelete: SetNull)
  orders              StoreOrder[]
}

model ProductTemplate {
  id           String   @id @default(uuid())
  adminId      String
  name         String
  description  String?
  price        Float
  traffic      BigInt   // in bytes
  durationDays Int
  inboundIds   Json     // Array of inbound IDs
  locationSet  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  admin        Admin    @relation(fields: [adminId], references: [id], onDelete: Cascade)
  orders       StoreOrder[]
}

model StoreOrder {
  id           String   @id @default(uuid())
  trackingCode String   @unique
  storeId      String
  productId    String
  
  clientName   String
  telegramId   String?
  whatsapp     String?
  notes        String?
  
  receiptText  String?
  receiptImage String?
  
  status       String   @default("PENDING") // PENDING, APPROVED, REJECTED, DELIVERED
  
  clientId     String?  // The newly created client (or modified existing client)
  isRenewal    Boolean  @default(false)
  renewClientId String? // If renewal, which client are they renewing?
  
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  store        StoreProfile    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  product      ProductTemplate @relation(fields: [productId], references: [id], onDelete: Restrict)
  client       Client?         @relation("CreatedClient", fields: [clientId], references: [id], onDelete: SetNull)
  renewClient  Client?         @relation("RenewClient", fields: [renewClientId], references: [id], onDelete: SetNull)
}
`;

let s = fs.readFileSync('prisma/schema.prisma', 'utf8');
let topPart = s.substring(0, s.indexOf('// ---------------------------------------------------------\n// Premium Features'));
if (topPart === '') {
  // Try CRLF
  topPart = s.substring(0, s.indexOf('// ---------------------------------------------------------\r\n// Premium Features'));
}

fs.writeFileSync('prisma/schema.prisma', topPart + cleanState);
