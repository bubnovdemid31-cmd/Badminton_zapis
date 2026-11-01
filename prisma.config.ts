import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
export default defineConfig({
  schema: "prisma/schema.prisma",
  experimental: { adapter: true },
  engine: "js",
  adapter: async () => new PrismaPg({ connectionString: env("DATABASE_URL") }),
  migrations: { path: "prisma/migrations" },
});
