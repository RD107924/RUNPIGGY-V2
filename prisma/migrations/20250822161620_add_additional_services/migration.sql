-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_shipment_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lineNickname" TEXT,
    "recipientName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "idNumber" TEXT,
    "calculationResult" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_PURCHASE',
    "additionalServices" TEXT,
    "serviceQuoted" BOOLEAN NOT NULL DEFAULT false,
    "serviceQuoteAmount" REAL,
    "assignedToId" TEXT,
    "customerId" TEXT,
    CONSTRAINT "shipment_orders_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "shipment_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_shipment_orders" ("address", "assignedToId", "calculationResult", "createdAt", "customerId", "id", "idNumber", "lineNickname", "phone", "recipientName", "status") SELECT "address", "assignedToId", "calculationResult", "createdAt", "customerId", "id", "idNumber", "lineNickname", "phone", "recipientName", "status" FROM "shipment_orders";
DROP TABLE "shipment_orders";
ALTER TABLE "new_shipment_orders" RENAME TO "shipment_orders";
CREATE INDEX "shipment_orders_customerId_idx" ON "shipment_orders"("customerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
