import type {
  CalendarConnectorLike,
  DriveConnectorLike,
  GmailConnectorLike
} from "@personal-ai/tool-registry";

import type { ConnectorService } from "./connector-service.js";
import type { CalendarConnectorWithDetails } from "./microsoft-365-connectors.js";

export interface CalendarConnectorWithDetailsLike extends CalendarConnectorLike {
  getEventDetails(eventId: string): Promise<Record<string, unknown>>;
}

export class WorkspaceMailConnector implements GmailConnectorLike {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly google: GmailConnectorLike,
    private readonly microsoft: GmailConnectorLike
  ) {}

  private async resolve() {
    const microsoft = await this.connectorService.getMicrosoft365Config();
    if (microsoft.source !== "none") {
      return this.microsoft;
    }

    const google = await this.connectorService.getGoogleWorkspaceConfig();
    if (google.source !== "none") {
      return this.google;
    }

    throw new Error(
      "No mail connector is configured yet. Add Google Workspace or Microsoft 365 credentials in Settings first."
    );
  }

  async searchMessages(query: string, limit?: number) {
    return (await this.resolve()).searchMessages(query, limit);
  }

  async getMessage(messageId: string) {
    return (await this.resolve()).getMessage(messageId);
  }

  async createDraft(input: Record<string, unknown>) {
    return (await this.resolve()).createDraft(input);
  }

  async sendMessage(input: Record<string, unknown>) {
    return (await this.resolve()).sendMessage(input);
  }
}

export class WorkspaceCalendarConnector implements CalendarConnectorWithDetailsLike {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly google: CalendarConnectorWithDetailsLike,
    private readonly microsoft: CalendarConnectorWithDetails
  ) {}

  private async resolve() {
    const microsoft = await this.connectorService.getMicrosoft365Config();
    if (microsoft.source !== "none") {
      return this.microsoft;
    }

    const google = await this.connectorService.getGoogleWorkspaceConfig();
    if (google.source !== "none") {
      return this.google;
    }

    throw new Error(
      "No calendar connector is configured yet. Add Google Workspace or Microsoft 365 credentials in Settings first."
    );
  }

  async listEvents(input: Record<string, unknown>) {
    return (await this.resolve()).listEvents(input);
  }

  async createEvent(input: Record<string, unknown>) {
    return (await this.resolve()).createEvent(input);
  }

  async updateEvent(input: Record<string, unknown>) {
    return (await this.resolve()).updateEvent(input);
  }

  async getEventDetails(eventId: string) {
    return (await this.resolve()).getEventDetails(eventId);
  }
}

export class WorkspaceDriveConnector implements DriveConnectorLike {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly google: DriveConnectorLike
  ) {}

  private async resolve() {
    const google = await this.connectorService.getGoogleWorkspaceConfig();
    if (google.source !== "none") {
      return this.google;
    }

    throw new Error(
      "Google Drive is not configured yet. Add Google Workspace credentials in Settings first."
    );
  }

  async searchFiles(input: Record<string, unknown>) {
    return (await this.resolve()).searchFiles(input);
  }

  async getFileMetadata(input: Record<string, unknown>) {
    return (await this.resolve()).getFileMetadata(input);
  }

  async downloadFile(input: Record<string, unknown>) {
    return (await this.resolve()).downloadFile(input);
  }
}
