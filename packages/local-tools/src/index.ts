import { createBrowserTools } from "./browser-tools.js";
import { BrowserSessionManager } from "./browser-manager.js";
import { createFilesystemTools } from "./filesystem-tools.js";
import { createShellTools } from "./shell-tools.js";
import { createSystemTools } from "./system-tools.js";

export * from "./browser-manager.js";

export const createLocalTools = () => [
  ...createFilesystemTools(),
  ...createShellTools(),
  ...createBrowserTools(),
  ...createSystemTools()
];

export { BrowserSessionManager };
