import { AgentDatabase } from "@personal-ai/db";
import { nowIso } from "@personal-ai/shared";

import { env } from "./config.js";

const seed = async () => {
  const db = await AgentDatabase.connect({
    uri: env.MONGODB_URI,
    dbName: env.MONGODB_DB_NAME
  });

  await db.seedDefaults(env.MONGODB_URI);

  const existingSessions = await db.listSessionsWithPreview({ limit: 1 });
  if (!existingSessions.length) {
    const { session, conversation } = await db.createSession({
      profileId: "profile_local",
      titleFromContent: "Welcome to your local AI agent"
    });

    await db.createMessage({
      sessionId: session.id,
      conversationId: conversation.id,
      role: "assistant",
      attachments: [],
      content:
        "Welcome to your local-first AI agent. Add your OpenAI or Gemini API key in apps/server/.env, then ask me to inspect files, browse, or help organize your work."
    });

    await db.createMemory({
      profileId: "profile_local",
      sessionId: session.id,
      kind: "preference",
      content: "User prefers a local-first automation workflow.",
      confidence: 0.9,
      source: "seed"
    });

    await db.createTask({
      sessionId: session.id,
      title: "Verify local AI agent setup",
      description: "Check MongoDB connection, open the web UI, and add API keys.",
      status: "open",
      outcome: `Seeded at ${nowIso()}`
    });
  }

  await db.close();
  console.log("Seed complete.");
};

void seed();
