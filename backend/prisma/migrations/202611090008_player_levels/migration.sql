ALTER TABLE "User" ADD COLUMN "creditLimit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "playerLevelId" TEXT REFERENCES "PlayerLevel"("id");
ALTER TABLE "Settings" ADD COLUMN "balancePolicy" TEXT NOT NULL DEFAULT 'ALLOW';
CREATE TABLE "PlayerLevel" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '', "archived" BOOLEAN NOT NULL DEFAULT false);
CREATE UNIQUE INDEX "PlayerLevel_name_key" ON "PlayerLevel"("name");
CREATE TABLE "SessionLevel" ("sessionId" TEXT NOT NULL REFERENCES "Session"("id") ON DELETE CASCADE, "levelId" TEXT NOT NULL REFERENCES "PlayerLevel"("id"), PRIMARY KEY("sessionId", "levelId"));
INSERT INTO "PlayerLevel" ("id", "name", "description") VALUES ('beginner','Beginner','Начинающий'), ('beginner-plus','Beginner+','Начинающий с опытом'), ('amateur','Amateur','Любитель'), ('advanced','Advanced','Продвинутый любитель');
