import type { Response } from "express";

import type { RunEvent } from "@personal-ai/shared";
import type { RunEventSink } from "@personal-ai/agent-core";

export class RunStreamService implements RunEventSink {
  private readonly clients = new Map<string, Set<Response>>();
  private readonly backlog = new Map<string, RunEvent[]>();

  subscribe(runId: string, response: Response) {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    const runClients = this.clients.get(runId) ?? new Set<Response>();
    runClients.add(response);
    this.clients.set(runId, runClients);

    const bufferedEvents = this.backlog.get(runId) ?? [];
    for (const event of bufferedEvents) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    const keepAlive = setInterval(() => {
      response.write(": keep-alive\n\n");
    }, 15_000);

    response.on("close", () => {
      clearInterval(keepAlive);
      runClients.delete(response);
      if (!runClients.size) {
        this.clients.delete(runId);
      }
      response.end();
    });
  }

  publish(event: RunEvent) {
    const events = this.backlog.get(event.runId) ?? [];
    events.push(event);
    this.backlog.set(event.runId, events.slice(-100));

    const runClients = this.clients.get(event.runId);
    runClients?.forEach((client) => {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    });
  }
}
