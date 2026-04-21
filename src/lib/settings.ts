export type AIProvider = "gemini" | "anthropic";

export interface AppSettings {
  activeProvider: AIProvider;
  geminiApiKey: string;
  anthropicApiKey: string;
  shipsgoToken: string;
  /** When true, the WeChat handoff action is shown on factory Quick Share. Defaults to false. */
  wechatHandoffEnabled: boolean;
}

const STORAGE_KEY = "tafakah-settings";

const DEFAULTS: AppSettings = {
  activeProvider: "gemini",
  geminiApiKey: "",
  anthropicApiKey: "",
  shipsgoToken: "",
  wechatHandoffEnabled: false,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function getActiveProviderKey(): { provider: AIProvider; apiKey: string } {
  const s = loadSettings();
  return {
    provider: s.activeProvider,
    apiKey: s.activeProvider === "gemini" ? s.geminiApiKey : s.anthropicApiKey,
  };
}

export function getShipsgoToken(): string {
  return loadSettings().shipsgoToken;
}

export function isWechatHandoffEnabled(): boolean {
  return loadSettings().wechatHandoffEnabled === true;
}
