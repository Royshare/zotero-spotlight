export type SpotlightLaunchMode = "search" | "command";
export type SpotlightShortcut =
  "mod-p" | "mod-shift-p" | "mod-k" | "mod-o" | "off";

export type SpotlightShortcutConfig = {
  search: Exclude<SpotlightShortcut, "off">;
  command: SpotlightShortcut;
};

export const SPOTLIGHT_SHORTCUT_OPTIONS: SpotlightShortcut[] = [
  "mod-p",
  "mod-shift-p",
  "mod-k",
  "mod-o",
];

export type SpotlightGuideShortcutMode = "on" | "off" | "off-note";

export const SPOTLIGHT_GUIDE_SHORTCUT_OPTIONS: SpotlightGuideShortcutMode[] = [
  "on",
  "off",
  "off-note",
];

export function resolveShortcutConfig(
  searchValue: unknown,
  commandValue: unknown,
  legacyMode: unknown,
  legacyCommandEnabled: unknown,
): SpotlightShortcutConfig {
  const legacySearch = legacyMode === "fallback" ? "mod-shift-p" : "mod-p";
  const legacyCommand =
    legacyCommandEnabled === false
      ? "off"
      : legacySearch === "mod-p"
        ? "mod-shift-p"
        : "mod-p";
  const search = isActiveShortcut(searchValue) ? searchValue : legacySearch;
  const command = isShortcut(commandValue) ? commandValue : legacyCommand;
  return {
    search,
    command: command === search ? "off" : command,
  };
}

export function getShortcutFromEvent(
  event: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "key" | "code"
  >,
  isMac: boolean,
): Exclude<SpotlightShortcut, "off"> | null {
  if (event.altKey || !(isMac ? event.metaKey : event.ctrlKey)) {
    return null;
  }
  const key = event.key?.toLowerCase();
  const code = event.code;
  if (key === "p" || code === "KeyP") {
    return event.shiftKey ? "mod-shift-p" : "mod-p";
  }
  if (event.shiftKey) {
    return null;
  }
  if (key === "k" || code === "KeyK") {
    return "mod-k";
  }
  if (key === "o" || code === "KeyO") {
    return "mod-o";
  }
  return null;
}

export function resolveSpotlightShortcut(
  pressedShortcut: Exclude<SpotlightShortcut, "off">,
  config: SpotlightShortcutConfig,
): SpotlightLaunchMode | null {
  if (pressedShortcut === config.search) {
    return "search";
  }
  if (pressedShortcut === config.command) {
    return "command";
  }
  return null;
}

export function assignSpotlightShortcut(
  config: SpotlightShortcutConfig,
  target: SpotlightLaunchMode,
  shortcut: unknown,
): SpotlightShortcutConfig {
  if (target === "search") {
    if (!isActiveShortcut(shortcut)) {
      return config;
    }
    return {
      search: shortcut,
      command: shortcut === config.command ? config.search : config.command,
    };
  }
  if (!isShortcut(shortcut)) {
    return config;
  }
  const replacementSearch =
    shortcut === config.search
      ? config.command === "off"
        ? getAlternativeShortcut(shortcut)
        : config.command
      : config.search;
  return { search: replacementSearch, command: shortcut };
}

export function formatSpotlightShortcut(
  shortcut: SpotlightShortcut,
  modifier: string,
): string {
  switch (shortcut) {
    case "mod-p":
      return `${modifier}+P`;
    case "mod-shift-p":
      return `${modifier}+Shift+P`;
    case "mod-k":
      return `${modifier}+K`;
    case "mod-o":
      return `${modifier}+O`;
    default:
      return "Off";
  }
}

export function isActiveShortcut(
  value: unknown,
): value is Exclude<SpotlightShortcut, "off"> {
  return SPOTLIGHT_SHORTCUT_OPTIONS.includes(value as SpotlightShortcut);
}

export function isShortcut(value: unknown): value is SpotlightShortcut {
  return value === "off" || isActiveShortcut(value);
}

function getAlternativeShortcut(
  shortcut: SpotlightShortcut,
): "mod-p" | "mod-shift-p" {
  return shortcut === "mod-p" ? "mod-shift-p" : "mod-p";
}

export function resolveGuideShortcutMode(
  value: unknown,
): SpotlightGuideShortcutMode {
  return isGuideShortcutMode(value) ? value : "on";
}

export function isGuideShortcutEnabled(
  mode: SpotlightGuideShortcutMode,
  isNoteTab: boolean,
): boolean {
  if (mode === "off") {
    return false;
  }
  if (mode === "off-note" && isNoteTab) {
    return false;
  }
  return true;
}

export function isNoteTabType(value: unknown): boolean {
  return (
    String(value || "")
      .split("-")[0]
      .toLowerCase() === "note"
  );
}

function isGuideShortcutMode(
  value: unknown,
): value is SpotlightGuideShortcutMode {
  return SPOTLIGHT_GUIDE_SHORTCUT_OPTIONS.includes(
    value as SpotlightGuideShortcutMode,
  );
}
