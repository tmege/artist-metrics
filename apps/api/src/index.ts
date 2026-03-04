import { config } from "dotenv";
config({ path: "../../.env" });

import { buildApp } from "./app.js";

async function start() {
  const { app, env } = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
