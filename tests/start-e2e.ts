import setup from "./setup-e2e.js";
await setup();
await import(new URL("../dist/backend/src/index.js", import.meta.url).href);
