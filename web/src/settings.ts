import type { ViewName } from "./types";

export const LOCAL_SETTINGS_STORAGE_KEY = "ae-netscope-settings";

export const defaultViewOptions = [
  "dashboard",
  "devices",
  "ipMacs",
  "networks",
  "topology",
  "quality",
  "vlans",
  "services",
  "hardware",
  "notes",
  "health",
  "updates",
  "settings",
] as const satisfies readonly ViewName[];

export type DefaultView = (typeof defaultViewOptions)[number];

export type LocalSettings = {
  compactTables: boolean;
  defaultView: DefaultView;
  reducedMotion: boolean;
  showFooter: boolean;
  showGitHubButton: boolean;
  showPreviewNotice: boolean;
  showSystemStatus: boolean;
  startSidebarCollapsed: boolean;
};

export const defaultLocalSettings: LocalSettings = {
  compactTables: false,
  defaultView: "dashboard",
  reducedMotion: false,
  showFooter: true,
  showGitHubButton: true,
  showPreviewNotice: true,
  showSystemStatus: true,
  startSidebarCollapsed: false,
};

function isDefaultView(value: unknown): value is DefaultView {
  return typeof value === "string" && defaultViewOptions.some((option) => option === value);
}

export function readLocalSettings(): LocalSettings {
  try {
    const stored = window.localStorage.getItem(LOCAL_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return { ...defaultLocalSettings };
    }
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return {
      compactTables:
        typeof parsed.compactTables === "boolean"
          ? parsed.compactTables
          : defaultLocalSettings.compactTables,
      defaultView: isDefaultView(parsed.defaultView)
        ? parsed.defaultView
        : defaultLocalSettings.defaultView,
      reducedMotion:
        typeof parsed.reducedMotion === "boolean"
          ? parsed.reducedMotion
          : defaultLocalSettings.reducedMotion,
      showFooter:
        typeof parsed.showFooter === "boolean" ? parsed.showFooter : defaultLocalSettings.showFooter,
      showGitHubButton:
        typeof parsed.showGitHubButton === "boolean"
          ? parsed.showGitHubButton
          : defaultLocalSettings.showGitHubButton,
      showPreviewNotice:
        typeof parsed.showPreviewNotice === "boolean"
          ? parsed.showPreviewNotice
          : defaultLocalSettings.showPreviewNotice,
      showSystemStatus:
        typeof parsed.showSystemStatus === "boolean"
          ? parsed.showSystemStatus
          : defaultLocalSettings.showSystemStatus,
      startSidebarCollapsed:
        typeof parsed.startSidebarCollapsed === "boolean"
          ? parsed.startSidebarCollapsed
          : defaultLocalSettings.startSidebarCollapsed,
    };
  } catch {
    return { ...defaultLocalSettings };
  }
}

export function writeLocalSettings(settings: LocalSettings): boolean {
  try {
    window.localStorage.setItem(LOCAL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
