import type { LoggerLike } from "@personal-ai/tool-registry";

const log = (level: "INFO" | "WARN" | "ERROR", message: string, payload?: Record<string, unknown>) => {
  const timestamp = new Date().toISOString();
  const suffix = payload ? ` ${JSON.stringify(payload)}` : "";
  const line = `[${timestamp}] [${level}] ${message}${suffix}`;

  if (level === "ERROR") {
    console.error(line);
    return;
  }

  if (level === "WARN") {
    console.warn(line);
    return;
  }

  console.log(line);
};

export const logger: LoggerLike = {
  info(message, payload) {
    log("INFO", message, payload);
  },
  warn(message, payload) {
    log("WARN", message, payload);
  },
  error(message, payload) {
    log("ERROR", message, payload);
  }
};
