import type {
  ConnectorStatusRecord,
  GoogleWorkspaceConnectorSecret,
  Microsoft365ConnectorSecret,
  ServerEnv
} from "@personal-ai/shared";

import { ConnectorVaultService } from "./connector-vault-service.js";

export class ConnectorService {
  constructor(
    private readonly vault: ConnectorVaultService,
    private readonly env: ServerEnv
  ) {}

  async getGoogleWorkspaceConfig() {
    const vaultConfig = await this.vault.loadGoogleWorkspaceSecrets();
    const merged: GoogleWorkspaceConnectorSecret = {
      clientId: vaultConfig?.clientId || this.env.GOOGLE_CLIENT_ID || "",
      clientSecret: vaultConfig?.clientSecret || this.env.GOOGLE_CLIENT_SECRET || "",
      redirectUri: vaultConfig?.redirectUri || this.env.GOOGLE_REDIRECT_URI || "",
      refreshToken: vaultConfig?.refreshToken || this.env.GOOGLE_REFRESH_TOKEN || ""
    };

    const source: ConnectorStatusRecord["source"] =
      vaultConfig?.clientId && vaultConfig?.clientSecret && vaultConfig?.redirectUri && vaultConfig?.refreshToken
        ? "vault"
        : merged.clientId && merged.clientSecret && merged.redirectUri && merged.refreshToken
          ? "env"
          : "none";

    return {
      config: merged,
      source
    };
  }

  async saveGoogleWorkspaceConfig(secret: GoogleWorkspaceConnectorSecret) {
    await this.vault.saveGoogleWorkspaceSecrets(secret);
  }

  async clearGoogleWorkspaceConfig() {
    await this.vault.clearGoogleWorkspaceSecrets();
  }

  async getMicrosoft365Config() {
    const vaultConfig = await this.vault.loadMicrosoft365Secrets();
    const merged: Microsoft365ConnectorSecret = {
      clientId: vaultConfig?.clientId || this.env.MICROSOFT_CLIENT_ID || "",
      clientSecret: vaultConfig?.clientSecret || this.env.MICROSOFT_CLIENT_SECRET || "",
      tenantId: vaultConfig?.tenantId || this.env.MICROSOFT_TENANT_ID || "organizations",
      redirectUri: vaultConfig?.redirectUri || this.env.MICROSOFT_REDIRECT_URI || "",
      refreshToken: vaultConfig?.refreshToken || this.env.MICROSOFT_REFRESH_TOKEN || ""
    };

    const source: ConnectorStatusRecord["source"] =
      vaultConfig?.clientId &&
      vaultConfig?.clientSecret &&
      vaultConfig?.redirectUri &&
      vaultConfig?.refreshToken
        ? "vault"
        : merged.clientId &&
            merged.clientSecret &&
            merged.redirectUri &&
            merged.refreshToken
          ? "env"
          : "none";

    return {
      config: merged,
      source
    };
  }

  async saveMicrosoft365Config(secret: Microsoft365ConnectorSecret) {
    await this.vault.saveMicrosoft365Secrets(secret);
  }

  async clearMicrosoft365Config() {
    await this.vault.clearMicrosoft365Secrets();
  }

  async listStatuses(): Promise<ConnectorStatusRecord[]> {
    const googleWorkspace = await this.getGoogleWorkspaceConfig();
    const microsoft365 = await this.getMicrosoft365Config();
    const ollamaStatus = await this.checkOllama();

    return [
      {
        id: "openai",
        label: "OpenAI",
        status: this.env.OPENAI_API_KEY ? "connected" : "not_configured",
        authType: "api_key",
        source: this.env.OPENAI_API_KEY ? "env" : "none",
        detail: this.env.OPENAI_API_KEY
          ? "API key loaded from the server environment."
          : "Add OPENAI_API_KEY in apps/server/.env to enable hosted reasoning.",
        capabilities: ["Hosted reasoning", "Tool calling"]
      },
      {
        id: "gemini",
        label: "Gemini",
        status: this.env.GEMINI_API_KEY ? "connected" : "not_configured",
        authType: "api_key",
        source: this.env.GEMINI_API_KEY ? "env" : "none",
        detail: this.env.GEMINI_API_KEY
          ? "API key loaded from the server environment."
          : "Add GEMINI_API_KEY in apps/server/.env to enable Gemini.",
        capabilities: ["Hosted reasoning", "Tool calling"]
      },
      {
        id: "ollama",
        label: "Ollama",
        status: ollamaStatus.available ? "available" : "unavailable",
        authType: "local_runtime",
        source: "local",
        detail: ollamaStatus.detail,
        capabilities: ["Local drafting", "Summaries", "Low-cost fallback"],
        lastCheckedAt: new Date().toISOString()
      },
      {
        id: "google-workspace",
        label: "Google Workspace",
        status:
          googleWorkspace.source === "none" ? "not_configured" : "connected",
        authType: "oauth",
        source: googleWorkspace.source,
        detail:
          googleWorkspace.source === "none"
            ? "Add Google OAuth credentials in the secure connector vault."
            : "OAuth credentials are available for Gmail, Calendar, and Drive. Drive remains Google-only.",
        capabilities: ["Gmail", "Calendar", "Drive"],
        lastCheckedAt: new Date().toISOString()
      },
      {
        id: "microsoft-365",
        label: "Microsoft 365",
        status:
          microsoft365.source === "none" ? "not_configured" : "connected",
        authType: "oauth",
        source: microsoft365.source,
        detail:
          microsoft365.source === "none"
            ? "Add Microsoft Entra / Graph credentials in the secure connector vault."
            : "OAuth credentials are available for Outlook Mail and Calendar, and these become the preferred workspace mail/calendar connector.",
        capabilities: ["Outlook Mail", "Calendar"],
        lastCheckedAt: new Date().toISOString()
      }
    ];
  }

  private async checkOllama() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(`${this.env.OLLAMA_BASE_URL}/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) {
        return {
          available: false,
          detail: `Ollama responded with status ${response.status}.`
        };
      }

      return {
        available: true,
        detail: `Local runtime reachable at ${this.env.OLLAMA_BASE_URL}.`
      };
    } catch {
      clearTimeout(timeout);
      return {
        available: false,
        detail: `Could not reach Ollama at ${this.env.OLLAMA_BASE_URL}.`
      };
    }
  }
}
