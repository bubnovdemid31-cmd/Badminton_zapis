-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "searchText" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CLIENT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authVersion" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Trainer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Court_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL CHECK ("endsAt" > "startsAt"),
    "trainerId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "seriesId" TEXT,
    "format" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "price" INTEGER NOT NULL CHECK (price >= 0),
    "capacity" INTEGER NOT NULL CHECK (capacity > 0 AND (format <> 'PERSONAL' OR capacity = 1)),
    "open" BOOLEAN NOT NULL DEFAULT true,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Session_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Session_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Session_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "participantKey" TEXT NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "childName" TEXT,
    "childAge" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CHECK (("userId" IS NOT NULL AND "guestName" IS NULL AND "guestPhone" IS NULL) OR ("userId" IS NULL AND "guestName" IS NOT NULL AND "guestPhone" IS NOT NULL)),
    CHECK (("childName" IS NULL AND "childAge" IS NULL) OR ("childName" IS NOT NULL AND "childAge" IS NOT NULL AND "childAge" BETWEEN 3 AND 17)),
    CONSTRAINT "Booking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'club',
    "name" TEXT NOT NULL DEFAULT 'Клуб бадминтона',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Vladivostok',
    "phone" TEXT NOT NULL DEFAULT 'Контактный телефон пока не указан',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT 'Адрес уточняется',
    "cancelHours" INTEGER NOT NULL DEFAULT 12 CHECK ("cancelHours" >= 0)
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WebSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_startsAt_endsAt_idx" ON "Session"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Booking_userId_status_idx" ON "Booking"("userId", "status");

-- CreateIndex
CREATE INDEX "Booking_sessionId_status_idx" ON "Booking"("sessionId", "status");

-- CreateIndex
CREATE INDEX "WebSession_expiresAt_idx" ON "WebSession"("expiresAt");

-- Serialize capacity checks before reading inside application transactions.
CREATE TABLE "WriteLock" (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL);
INSERT INTO "WriteLock" (id,value) VALUES (1,0);
CREATE UNIQUE INDEX "one_active_participant" ON "Booking" ("sessionId","participantKey") WHERE status='BOOKED';

CREATE TRIGGER "session_overlap_insert" BEFORE INSERT ON "Session"
WHEN NEW.cancelled=0
BEGIN
 SELECT RAISE(ABORT,'trainer_or_court_overlap') WHERE EXISTS (
  SELECT 1 FROM "Session" s WHERE s.id<>NEW.id AND s.cancelled=0
  AND s."startsAt"<NEW."endsAt" AND s."endsAt">NEW."startsAt"
  AND (s."trainerId"=NEW."trainerId" OR s."courtId"=NEW."courtId")
 );
END;
CREATE TRIGGER "booking_capacity_insert" BEFORE INSERT ON "Booking"
WHEN NEW.status='BOOKED'
BEGIN
 SELECT RAISE(ABORT,'session_unavailable') WHERE NOT EXISTS (SELECT 1 FROM "Session" s WHERE s.id=NEW."sessionId" AND s.cancelled=0 AND s.open=1);
 SELECT RAISE(ABORT,'session_capacity_exceeded') WHERE (SELECT COUNT(*) FROM "Booking" b WHERE b."sessionId"=NEW."sessionId" AND b.status='BOOKED' AND b.id<>NEW.id) >= (SELECT capacity FROM "Session" WHERE id=NEW."sessionId");
 SELECT RAISE(ABORT,'client_booking_overlap') WHERE NEW."userId" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "Booking" b JOIN "Session" old ON old.id=b."sessionId" JOIN "Session" target ON target.id=NEW."sessionId"
  WHERE b.id<>NEW.id AND b."userId"=NEW."userId" AND b.status='BOOKED' AND old.cancelled=0 AND old.id<>target.id
  AND old."startsAt"<target."endsAt" AND old."endsAt">target."startsAt"
 );
END;

CREATE TRIGGER "session_overlap_update" BEFORE UPDATE ON "Session"
WHEN NEW.cancelled=0
BEGIN
 SELECT RAISE(ABORT,'trainer_or_court_overlap') WHERE EXISTS (
  SELECT 1 FROM "Session" s WHERE s.id<>NEW.id AND s.cancelled=0
  AND s."startsAt"<NEW."endsAt" AND s."endsAt">NEW."startsAt"
  AND (s."trainerId"=NEW."trainerId" OR s."courtId"=NEW."courtId")
 );
END;
CREATE TRIGGER "booking_capacity_update" BEFORE UPDATE ON "Booking"
WHEN NEW.status='BOOKED'
BEGIN
 SELECT RAISE(ABORT,'session_unavailable') WHERE NOT EXISTS (SELECT 1 FROM "Session" s WHERE s.id=NEW."sessionId" AND s.cancelled=0 AND s.open=1);
 SELECT RAISE(ABORT,'session_capacity_exceeded') WHERE (SELECT COUNT(*) FROM "Booking" b WHERE b."sessionId"=NEW."sessionId" AND b.status='BOOKED' AND b.id<>NEW.id) >= (SELECT capacity FROM "Session" WHERE id=NEW."sessionId");
 SELECT RAISE(ABORT,'client_booking_overlap') WHERE NEW."userId" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "Booking" b JOIN "Session" old ON old.id=b."sessionId" JOIN "Session" target ON target.id=NEW."sessionId"
  WHERE b.id<>NEW.id AND b."userId"=NEW."userId" AND b.status='BOOKED' AND old.cancelled=0 AND old.id<>target.id
  AND old."startsAt"<target."endsAt" AND old."endsAt">target."startsAt"
 );
END;

CREATE TRIGGER "session_capacity_update" BEFORE UPDATE OF capacity ON "Session"
BEGIN
 SELECT RAISE(ABORT,'capacity_below_bookings') WHERE NEW.capacity < (SELECT COUNT(*) FROM "Booking" WHERE "sessionId"=NEW.id AND status='BOOKED');
END;
