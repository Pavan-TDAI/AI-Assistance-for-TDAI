import { GoogleCalendarConnector } from "./calendar.js";
import { GoogleDriveConnector } from "./drive.js";
import { GmailConnector } from "./gmail.js";
import { GoogleOAuthManager, type GoogleConnectorConfig } from "./oauth.js";
import { createGoogleTools } from "./tools.js";

export * from "./calendar.js";
export * from "./drive.js";
export * from "./gmail.js";
export * from "./oauth.js";
export * from "./tools.js";

export const createGoogleConnectorBundle = (
  config: GoogleConnectorConfig | (() => GoogleConnectorConfig | Promise<GoogleConnectorConfig>)
) => {
  const oauth = new GoogleOAuthManager(config);

  return {
    oauth,
    gmail: new GmailConnector(oauth),
    calendar: new GoogleCalendarConnector(oauth),
    drive: new GoogleDriveConnector(oauth)
  };
};

export { createGoogleTools };
