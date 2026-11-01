import { defineConfig } from "prisma/config";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { databaseUrl } from "./server/database-path.js";
export default defineConfig({
  schema: "prisma/schema.prisma",
  experimental: { adapter: true },
  engine: "js",
  adapter: async () =>
    new PrismaLibSQL(
      { url: databaseUrl, concurrency: 1 },
      { timestampFormat: "unixepoch-ms" },
    ),
  migrations: { path: "prisma/migrations" },
});
