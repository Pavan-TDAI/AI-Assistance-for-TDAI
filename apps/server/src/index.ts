import { env } from "./config.js";
import { logger } from "./logger.js";
import { createServer } from "./app.js";

const bootstrap = async () => {
  const { app, close } = await createServer();
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info("Local AI agent server listening.", {
      url: `http://${env.HOST}:${env.PORT}`
    });
  });

  const shutdown = async () => {
    logger.info("Shutting down server.");
    server.close();
    await close();
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
};

void bootstrap();
