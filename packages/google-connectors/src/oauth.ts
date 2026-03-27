import { google } from "googleapis";

export interface GoogleConnectorConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  refreshToken?: string;
}

type GoogleConfigLoader =
  | GoogleConnectorConfig
  | (() => GoogleConnectorConfig | Promise<GoogleConnectorConfig>);

export class GoogleOAuthManager {
  constructor(private readonly configLoader: GoogleConfigLoader) {}

  private async loadConfig() {
    return typeof this.configLoader === "function"
      ? await this.configLoader()
      : this.configLoader;
  }

  async getResolvedConfig() {
    return this.loadConfig();
  }

  async isConfigured() {
    const config = await this.loadConfig();
    return Boolean(
      config.clientId && config.clientSecret && config.redirectUri && config.refreshToken
    );
  }

  async getClientOrThrow(): Promise<InstanceType<typeof google.auth.OAuth2>> {
    const config = await this.loadConfig();

    if (
      !config.clientId ||
      !config.clientSecret ||
      !config.redirectUri ||
      !config.refreshToken
    ) {
      throw new Error(
        "Google connectors are not configured yet. Add Google Workspace credentials in Settings or apps/server/.env before using Gmail, Calendar, or Drive tools."
      );
    }

    const client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    client.setCredentials({
      refresh_token: config.refreshToken
    });

    return client;
  }
}
