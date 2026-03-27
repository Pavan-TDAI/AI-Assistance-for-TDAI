"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound, Save, ServerCog, ShieldCheck } from "lucide-react";

import type {
  ConnectorStatusRecord,
  GoogleWorkspaceConnectorSecret,
  HealthResponse,
  Microsoft365ConnectorSecret,
  SettingsRecord,
  SettingsUpdate
} from "@personal-ai/shared";

import { api } from "../lib/api";

const joinLines = (items: string[]) => items.join("\n");
const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export const SettingsForm = () => {
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [tools, setTools] = useState<
    Array<{
      name: string;
      description: string;
      permissionCategory: string;
      safeByDefault: boolean;
      timeoutMs: number;
    }>
  >([]);
  const [connectors, setConnectors] = useState<ConnectorStatusRecord[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleSecret, setGoogleSecret] = useState<GoogleWorkspaceConnectorSecret>({
    clientId: "",
    clientSecret: "",
    redirectUri: "",
    refreshToken: ""
  });
  const [microsoftSecret, setMicrosoftSecret] = useState<Microsoft365ConnectorSecret>({
    clientId: "",
    clientSecret: "",
    tenantId: "organizations",
    redirectUri: "",
    refreshToken: ""
  });
  const showSetupGuide = searchParams.get("setup") === "account";
  const nextPath = searchParams.get("next") ?? "/chat";

  const load = async () => {
    const [nextSettings, nextTools, nextConnectors, nextHealth] = await Promise.all([
      api.getSettings(),
      api.getTools(),
      api.getConnectors(),
      api.getHealth()
    ]);
    setSettings(nextSettings);
    setTools(nextTools);
    setConnectors(nextConnectors);
    setHealth(nextHealth);
  };

  useEffect(() => {
    void load().catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
  }, []);

  if (!settings) {
    return (
      <div className="glass-panel rounded-[2rem] p-6">
        Loading settings...
      </div>
    );
  }

  const save = async () => {
    const payload: SettingsUpdate = {
      profileName: settings.profileName,
      provider: settings.provider,
      providerSelectionMode: settings.providerSelectionMode,
      routingPolicy: settings.routingPolicy,
      activeModel: settings.activeModel,
      openAiModel: settings.openAiModel,
      geminiModel: settings.geminiModel,
      ollamaModel: settings.ollamaModel,
      mongoUri: settings.mongoUri,
      maxToolSteps: settings.maxToolSteps,
      toolPreferences: settings.toolPreferences,
      approvalDefaults: settings.approvalDefaults,
      usageControls: settings.usageControls
    };

    try {
      const updated = await api.updateSettings(payload);
      setSettings(updated);
      setStatus(
        "Saved. Restart the server only if you changed .env credentials or MongoDB connection details."
      );
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setStatus(null);
    }
  };

  const saveGoogleWorkspace = async () => {
    try {
      const updated = await api.saveGoogleWorkspaceConnector(googleSecret);
      setConnectors(updated);
      setGoogleSecret({
        clientId: "",
        clientSecret: "",
        redirectUri: "",
        refreshToken: ""
      });
      setStatus("Google Workspace connector saved in the secure local vault.");
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const saveMicrosoft365 = async () => {
    try {
      const updated = await api.saveMicrosoft365Connector(microsoftSecret);
      setConnectors(updated);
      setMicrosoftSecret({
        clientId: "",
        clientSecret: "",
        tenantId: "organizations",
        redirectUri: "",
        refreshToken: ""
      });
      setStatus("Microsoft 365 connector saved in the secure local vault.");
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  return (
    <div className="scroll-pane h-full space-y-4 p-2 pr-1">
      {showSetupGuide ? (
        <section className="glass-panel rounded-[2rem] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-display text-2xl font-semibold text-ink">Finish your account setup</p>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-ink/62">
                You are signed in. Before you start working, choose the runtime you want, save your
                Google or Microsoft connector credentials securely, and review the safe roots and approval defaults below.
              </p>
            </div>
            <Link href={nextPath} className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink">
              Continue to workspace
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <SetupTip title="1. Choose the runtime" text="Pick Ollama, OpenAI, or Gemini and confirm the active model." />
            <SetupTip title="2. Save connector secrets" text="Add Google Workspace or Microsoft 365 OAuth credentials in the secure vault below." />
            <SetupTip title="3. Review safe defaults" text="Check approvals, safe roots, and usage limits before the agent starts acting on work." />
          </div>
        </section>
      ) : null}

      <section className="glass-panel rounded-[2rem] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-semibold text-ink">Runtime settings</p>
            <p className="mt-1 max-w-3xl text-sm text-ink/60">
              Control provider routing, usage budgets, approvals, and connector health from one place.
            </p>
            {health ? (
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-ink/45">
                Available providers: {health.availableProviders.join(", ")}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-2xl bg-ink px-4 py-2 text-sm font-medium text-white"
          >
            <Save className="h-4 w-4" />
            Save changes
          </button>
        </div>
        {status ? <p className="mt-4 text-sm text-signal">{status}</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="glass-panel space-y-4 rounded-[2rem] p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Models and routing</h2>
          <Field label="Profile name">
            <input
              value={settings.profileName}
              onChange={(event) =>
                setSettings({ ...settings, profileName: event.target.value })
              }
              className="field"
            />
          </Field>
          <Field label="Primary provider">
            <select
              value={settings.provider}
              onChange={(event) => {
                const provider = event.target.value as SettingsRecord["provider"];
                setSettings({
                  ...settings,
                  provider,
                  activeModel:
                    provider === "openai"
                      ? settings.openAiModel
                      : provider === "gemini"
                        ? settings.geminiModel
                        : provider === "ollama"
                          ? settings.ollamaModel
                          : "mock-local"
                });
              }}
              className="field"
            >
              <option value="mock">mock</option>
              <option value="openai">openai</option>
              <option value="gemini">gemini</option>
              <option value="ollama">ollama</option>
            </select>
          </Field>
          <Field label="Routing policy">
            <select
              value={settings.routingPolicy}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  routingPolicy: event.target.value as SettingsRecord["routingPolicy"]
                })
              }
              className="field"
            >
              <option value="hosted">hosted</option>
              <option value="local">local</option>
              <option value="fallback">fallback</option>
            </select>
          </Field>
          <Field label="Active model">
            <input
              value={settings.activeModel}
              onChange={(event) =>
                setSettings({ ...settings, activeModel: event.target.value })
              }
              className="field"
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="OpenAI model">
              <input
                value={settings.openAiModel}
                onChange={(event) =>
                  setSettings({ ...settings, openAiModel: event.target.value })
                }
                className="field"
              />
            </Field>
            <Field label="Gemini model">
              <input
                value={settings.geminiModel}
                onChange={(event) =>
                  setSettings({ ...settings, geminiModel: event.target.value })
                }
                className="field"
              />
            </Field>
            <Field label="Ollama model">
              <input
                value={settings.ollamaModel}
                onChange={(event) =>
                  setSettings({ ...settings, ollamaModel: event.target.value })
                }
                className="field"
              />
            </Field>
          </div>
          <Field label="MongoDB URI">
            <input
              value={settings.mongoUri}
              onChange={(event) =>
                setSettings({ ...settings, mongoUri: event.target.value })
              }
              className="field"
            />
          </Field>
          <Field label="Max tool steps">
            <input
              type="number"
              min={1}
              max={20}
              value={settings.maxToolSteps}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  maxToolSteps: Number(event.target.value)
                })
              }
              className="field"
            />
          </Field>
        </section>

        <section className="glass-panel space-y-4 rounded-[2rem] p-6">
          <div className="flex items-center gap-2">
            <ServerCog className="h-5 w-5 text-signal" />
            <h2 className="font-display text-lg font-semibold text-ink">Usage controls</h2>
          </div>
          <Field label="Recent message window">
            <input
              type="number"
              min={6}
              max={40}
              value={settings.usageControls.contextMessageWindow}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  usageControls: {
                    ...settings.usageControls,
                    contextMessageWindow: Number(event.target.value)
                  }
                })
              }
              className="field"
            />
          </Field>
          <Field label="Summary trigger">
            <input
              type="number"
              min={8}
              max={80}
              value={settings.usageControls.summaryTriggerMessages}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  usageControls: {
                    ...settings.usageControls,
                    summaryTriggerMessages: Number(event.target.value)
                  }
                })
              }
              className="field"
            />
          </Field>
          <Field label="Max prompt characters">
            <input
              type="number"
              min={2000}
              max={120000}
              value={settings.usageControls.maxPromptChars}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  usageControls: {
                    ...settings.usageControls,
                    maxPromptChars: Number(event.target.value)
                  }
                })
              }
              className="field"
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Warning cost (USD)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={settings.usageControls.warningCostUsd}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    usageControls: {
                      ...settings.usageControls,
                      warningCostUsd: Number(event.target.value)
                    }
                  })
                }
                className="field"
              />
            </Field>
            <Field label="Hard limit (USD)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={settings.usageControls.hardLimitCostUsd}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    usageControls: {
                      ...settings.usageControls,
                      hardLimitCostUsd: Number(event.target.value)
                    }
                  })
                }
                className="field"
              />
            </Field>
          </div>
        </section>
      </div>

      <section className="glass-panel rounded-[2rem] p-6">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-signal" />
          <h2 className="font-display text-lg font-semibold text-ink">Approval defaults</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(
            Object.keys(settings.approvalDefaults) as Array<
              keyof SettingsRecord["approvalDefaults"]
            >
          ).map((key) => (
            <label
              key={key}
              className="flex items-center justify-between rounded-2xl border border-ink/10 bg-shell/80 px-4 py-3 text-sm text-ink"
            >
              <span>{key}</span>
              <input
                type="checkbox"
                checked={settings.approvalDefaults[key]}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    approvalDefaults: {
                      ...settings.approvalDefaults,
                      [key]: event.target.checked
                    }
                  })
                }
              />
            </label>
          ))}
        </div>
      </section>

      <section className="glass-panel grid gap-4 rounded-[2rem] p-6 xl:grid-cols-2">
        <Field label="Safe roots">
          <textarea
            value={joinLines(settings.toolPreferences.safeRoots)}
            onChange={(event) =>
              setSettings({
                ...settings,
                toolPreferences: {
                  ...settings.toolPreferences,
                  safeRoots: splitLines(event.target.value)
                }
              })
            }
            className="field min-h-28"
          />
        </Field>
        <Field label="Always allow browser domains">
          <textarea
            value={joinLines(settings.toolPreferences.alwaysAllowDomains)}
            onChange={(event) =>
              setSettings({
                ...settings,
                toolPreferences: {
                  ...settings.toolPreferences,
                  alwaysAllowDomains: splitLines(event.target.value)
                }
              })
            }
            className="field min-h-28"
          />
        </Field>
        <Field label="Safe shell prefixes">
          <textarea
            value={joinLines(settings.toolPreferences.safeShellCommands)}
            onChange={(event) =>
              setSettings({
                ...settings,
                toolPreferences: {
                  ...settings.toolPreferences,
                  safeShellCommands: splitLines(event.target.value)
                }
              })
            }
            className="field min-h-28"
          />
        </Field>
        <Field label="Blocked shell patterns">
          <textarea
            value={joinLines(settings.toolPreferences.blockedShellPatterns)}
            onChange={(event) =>
              setSettings({
                ...settings,
                toolPreferences: {
                  ...settings.toolPreferences,
                  blockedShellPatterns: splitLines(event.target.value)
                }
              })
            }
            className="field min-h-28"
          />
        </Field>
      </section>

      <section className="glass-panel rounded-[2rem] p-6">
        <div className="mb-5 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-ember" />
          <h2 className="font-display text-lg font-semibold text-ink">Connectors</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {connectors.map((connector) => (
            <div
              key={connector.id}
              className="rounded-[1.6rem] border border-ink/10 bg-shell/75 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{connector.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ink/45">
                    {connector.status} / {connector.authType}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs text-ink/55">
                  {connector.source}
                </span>
              </div>
              <p className="mt-3 text-sm text-ink/65">{connector.detail}</p>
              <p className="mt-3 text-xs text-ink/45">
                {connector.capabilities.join(" • ")}
              </p>

              {connector.id === "google-workspace" ? (
                <div className="mt-4 space-y-3 rounded-[1.3rem] border border-ink/10 bg-white/80 p-4">
                  <p className="text-sm font-medium text-ink">
                    Secure OAuth vault
                  </p>
                  <p className="text-xs text-ink/55">
                    These values are stored in the encrypted local connector vault, not in the settings database.
                  </p>
                  <div className="grid gap-3">
                    <input
                      type="password"
                      placeholder="Google Client ID"
                      value={googleSecret.clientId}
                      onChange={(event) =>
                        setGoogleSecret({ ...googleSecret, clientId: event.target.value })
                      }
                      className="field"
                    />
                    <input
                      type="password"
                      placeholder="Google Client Secret"
                      value={googleSecret.clientSecret}
                      onChange={(event) =>
                        setGoogleSecret({ ...googleSecret, clientSecret: event.target.value })
                      }
                      className="field"
                    />
                    <input
                      type="password"
                      placeholder="Redirect URI"
                      value={googleSecret.redirectUri}
                      onChange={(event) =>
                        setGoogleSecret({ ...googleSecret, redirectUri: event.target.value })
                      }
                      className="field"
                    />
                    <input
                      type="password"
                      placeholder="Refresh Token"
                      value={googleSecret.refreshToken}
                      onChange={(event) =>
                        setGoogleSecret({ ...googleSecret, refreshToken: event.target.value })
                      }
                      className="field"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveGoogleWorkspace()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-signal px-4 py-2 text-sm text-white"
                    >
                      Save securely
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void api.removeGoogleWorkspaceConnector().then((updated) => {
                          setConnectors(updated);
                          setStatus("Google Workspace connector removed from the vault.");
                        });
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm text-red-600"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : null}

              {connector.id === "microsoft-365" ? (
                <div className="mt-4 space-y-3 rounded-[1.3rem] border border-ink/10 bg-white/80 p-4">
                  <p className="text-sm font-medium text-ink">
                    Secure OAuth vault
                  </p>
                  <p className="text-xs text-ink/55">
                    Paste Microsoft Entra / Graph credentials here. They are stored in the encrypted local connector vault.
                  </p>
                  <div className="grid gap-3">
                    <input
                      type="password"
                      placeholder="Microsoft Client ID"
                      value={microsoftSecret.clientId}
                      onChange={(event) =>
                        setMicrosoftSecret({ ...microsoftSecret, clientId: event.target.value })
                      }
                      className="field"
                    />
                    <input
                      type="password"
                      placeholder="Microsoft Client Secret"
                      value={microsoftSecret.clientSecret}
                      onChange={(event) =>
                        setMicrosoftSecret({ ...microsoftSecret, clientSecret: event.target.value })
                      }
                      className="field"
                    />
                    <input
                      type="text"
                      placeholder="Tenant ID or organizations"
                      value={microsoftSecret.tenantId}
                      onChange={(event) =>
                        setMicrosoftSecret({ ...microsoftSecret, tenantId: event.target.value })
                      }
                      className="field"
                    />
                    <input
                      type="password"
                      placeholder="Redirect URI"
                      value={microsoftSecret.redirectUri}
                      onChange={(event) =>
                        setMicrosoftSecret({ ...microsoftSecret, redirectUri: event.target.value })
                      }
                      className="field"
                    />
                    <input
                      type="password"
                      placeholder="Refresh Token"
                      value={microsoftSecret.refreshToken}
                      onChange={(event) =>
                        setMicrosoftSecret({ ...microsoftSecret, refreshToken: event.target.value })
                      }
                      className="field"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveMicrosoft365()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-signal px-4 py-2 text-sm text-white"
                    >
                      Save securely
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void api.removeMicrosoft365Connector().then((updated) => {
                          setConnectors(updated);
                          setStatus("Microsoft 365 connector removed from the vault.");
                        });
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm text-red-600"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel rounded-[2rem] p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Registered tools</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {tools.map((tool) => (
            <div key={tool.name} className="rounded-[1.4rem] border border-ink/10 bg-shell/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-ink">{tool.name}</p>
                <span className="rounded-full bg-ink/10 px-3 py-1 text-xs text-ink/60">
                  {tool.permissionCategory}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink/60">{tool.description}</p>
              <p className="mt-3 text-xs text-ink/45">
                safeByDefault: {String(tool.safeByDefault)} | timeout: {tool.timeoutMs}ms
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const Field = ({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) => (
  <label className="block">
    <span className="mb-2 block text-sm font-medium text-ink/70">{label}</span>
    {children}
  </label>
);

const SetupTip = ({
  title,
  text
}: {
  title: string;
  text: string;
}) => (
  <div className="rounded-[1.4rem] border border-ink/10 bg-shell/75 p-4">
    <p className="text-sm font-semibold text-ink">{title}</p>
    <p className="mt-2 text-sm leading-7 text-ink/60">{text}</p>
  </div>
);
