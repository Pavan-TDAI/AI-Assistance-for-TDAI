import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

import type {
  GoogleWorkspaceConnectorSecret,
  Microsoft365ConnectorSecret
} from "@personal-ai/shared";

interface VaultEntry {
  encryption: "dpapi" | "aes-gcm";
  payload: string;
  updatedAt: string;
}

type VaultContents = Record<string, VaultEntry>;

const PROTECT_SCRIPT = `
$payload = [Console]::In.ReadToEnd()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
$protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($protected))
`;

const UNPROTECT_SCRIPT = `
$payload = [Console]::In.ReadToEnd()
$bytes = [Convert]::FromBase64String($payload)
$unprotected = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($unprotected))
`;

export class ConnectorVaultService {
  private readonly vaultPath: string;
  private readonly keyPath: string;

  constructor(rootDirectory: string) {
    this.vaultPath = join(rootDirectory, ".local-vault", "connectors.json");
    this.keyPath = join(rootDirectory, ".local-vault", "master.key");
  }

  async saveGoogleWorkspaceSecrets(secret: GoogleWorkspaceConnectorSecret) {
    await this.saveSecret("google-workspace", secret);
  }

  async loadGoogleWorkspaceSecrets() {
    return this.loadSecret<GoogleWorkspaceConnectorSecret>("google-workspace");
  }

  async clearGoogleWorkspaceSecrets() {
    await this.deleteSecret("google-workspace");
  }

  async saveMicrosoft365Secrets(secret: Microsoft365ConnectorSecret) {
    await this.saveSecret("microsoft-365", secret);
  }

  async loadMicrosoft365Secrets() {
    return this.loadSecret<Microsoft365ConnectorSecret>("microsoft-365");
  }

  async clearMicrosoft365Secrets() {
    await this.deleteSecret("microsoft-365");
  }

  private async saveSecret(name: string, value: Record<string, unknown>) {
    const vault = await this.readVault();
    const serialised = JSON.stringify(value);
    const encrypted = await this.encrypt(serialised);
    vault[name] = {
      encryption: encrypted.encryption,
      payload: encrypted.payload,
      updatedAt: new Date().toISOString()
    };
    await this.writeVault(vault);
  }

  private async loadSecret<T>(name: string): Promise<T | null> {
    const vault = await this.readVault();
    const entry = vault[name];
    if (!entry) {
      return null;
    }

    const decrypted = await this.decrypt(entry);
    return JSON.parse(decrypted) as T;
  }

  private async deleteSecret(name: string) {
    const vault = await this.readVault();
    if (!vault[name]) {
      return;
    }

    delete vault[name];
    await this.writeVault(vault);
  }

  private async readVault(): Promise<VaultContents> {
    try {
      const contents = await readFile(this.vaultPath, "utf8");
      return JSON.parse(contents) as VaultContents;
    } catch {
      return {};
    }
  }

  private async writeVault(vault: VaultContents) {
    await mkdir(dirname(this.vaultPath), { recursive: true });
    await writeFile(this.vaultPath, JSON.stringify(vault, null, 2), "utf8");
  }

  private async encrypt(value: string) {
    if (process.platform === "win32") {
      const payload = await this.runPowerShell(PROTECT_SCRIPT, value);
      return {
        encryption: "dpapi" as const,
        payload
      };
    }

    const key = await this.getLocalKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      encryption: "aes-gcm" as const,
      payload: `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`
    };
  }

  private async decrypt(entry: VaultEntry) {
    if (entry.encryption === "dpapi") {
      return this.runPowerShell(UNPROTECT_SCRIPT, entry.payload);
    }

    const [ivBase64, tagBase64, encryptedBase64] = entry.payload.split(".");
    if (!ivBase64 || !tagBase64 || !encryptedBase64) {
      throw new Error("Connector vault entry is corrupted.");
    }
    const key = await this.getLocalKey();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivBase64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, "base64")),
      decipher.final()
    ]).toString("utf8");
  }

  private async getLocalKey() {
    try {
      const key = await readFile(this.keyPath, "utf8");
      return Buffer.from(key, "base64");
    } catch {
      await mkdir(dirname(this.keyPath), { recursive: true });
      const key = randomBytes(32);
      await writeFile(this.keyPath, key.toString("base64"), "utf8");
      return key;
    }
  }

  private async runPowerShell(script: string, input: string) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        windowsHide: true
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `PowerShell exited with code ${code}.`));
          return;
        }
        resolve(stdout.trim());
      });

      child.stdin.write(input);
      child.stdin.end();
    });
  }
}
