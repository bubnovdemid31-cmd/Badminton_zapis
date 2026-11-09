ALTER TABLE "User" ADD COLUMN "balance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "priceSnapshot" INTEGER NOT NULL DEFAULT 0;
UPDATE "Booking" SET "priceSnapshot"=(SELECT "price" FROM "Session" WHERE "Session"."id"="Booking"."sessionId");
CREATE TABLE "LedgerEntry" (
"id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
"amount" INTEGER NOT NULL, "balanceAfter" INTEGER NOT NULL, "kind" TEXT NOT NULL,
"reason" TEXT NOT NULL, "method" TEXT NOT NULL, "actorId" TEXT NOT NULL,
"operationKey" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "LedgerEntry_operationKey_key" ON "LedgerEntry"("operationKey");
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt");
