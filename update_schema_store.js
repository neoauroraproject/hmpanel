const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

const newModels = `
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
  
  // Customer Data
  clientName   String
  telegramId   String?
  whatsapp     String?
  notes        String?
  
  // Payment
  receiptText  String?
  receiptImage String?
  
  status       String   @default("PENDING") // PENDING, APPROVED, REJECTED, DELIVERED
  
  // Delivery
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

schema += '\n' + newModels;

schema = schema.replace(/  domains   Domain\[\]\n/, '  domains   Domain[]\n  storeProfile StoreProfile?\n  productTemplates ProductTemplate[]\n');
schema = schema.replace(/  subClients Client\[\] @relation\("SubClients"\)\n/, '  subClients Client[] @relation("SubClients")\n  createdOrders StoreOrder[] @relation("CreatedClient")\n  renewedOrders StoreOrder[] @relation("RenewClient")\n');

fs.writeFileSync('prisma/schema.prisma', schema);
