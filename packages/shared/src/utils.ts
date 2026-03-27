import crypto from "node:crypto";

export const nowIso = () => new Date().toISOString();

export const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export const summariseObject = (value: unknown, limit = 240) => {
  const serialised = JSON.stringify(value);
  return serialised.length > limit ? `${serialised.slice(0, limit)}...` : serialised;
};

export const titleFromPrompt = (content: string) => {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.slice(0, 60) || "New session";
};
