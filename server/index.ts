import { app } from "./app.js";
import { db } from "./db.js";
const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`API запущен на порту ${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
