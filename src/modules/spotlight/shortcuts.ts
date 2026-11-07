export type SpotlightLaunchMode = "search" | "command";
export type SpotlightShortcut =
  | "mod-p"
  | "mod-shift-p"
  | "mod-k"
  | "mod-o"
  | "mod-slash"
  | "mod-shift-slash"
  | "off";
export type ActiveSpotlightShortcut = Exclude<SpotlightShortcut, "off">;

export type SpotlightShortcutConfig = {
  search: Exclude<SpotlightShortcut, "off">;
  command: SpotlightShortcut;
};

export const SPOTLIGHT_SHORTCUT_OPTIONS: ActiveSpotlightShortcut[] = [
  "mod-p",
  "mod-shift-p",
  "mod-k",
  "mod-o",
  "mod-slash",
  "mod-shift-slash",
];

export function resolveGuideShortcut(value: unknown): SpotlightShortcut {
  return isShortcut(value) ? value : "mod-slash";
}

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
  if (key === "/" || key === "?" || code === "Slash") {
    return event.shiftKey ? "mod-shift-slash" : "mod-slash";
  }
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

export function assignGuideShortcut(
  config: SpotlightShortcutConfig,
  currentGuide: SpotlightShortcut,
  shortcut: unknown,
): { config: SpotlightShortcutConfig; guide: SpotlightShortcut } {
  if (!isShortcut(shortcut)) {
    return { config, guide: currentGuide };
  }

  if (shortcut === "off") {
    return { config, guide: "off" };
  }

  let nextConfig = config;
  if (shortcut === config.search) {
    const replacement =
      currentGuide !== "off" && currentGuide !== config.command
        ? currentGuide
        : findAvailableShortcut([config.search, config.command]);
    nextConfig = assignSpotlightShortcut(config, "search", replacement);
  } else if (shortcut === config.command) {
    nextConfig = assignSpotlightShortcut(config, "command", currentGuide);
  }
  return { config: nextConfig, guide: shortcut };
}

export function reconcileGuideShortcut(
  config: SpotlightShortcutConfig,
  previousConfig: SpotlightShortcutConfig,
  guide: SpotlightShortcut,
): SpotlightShortcut {
  if (
    guide === "off" ||
    (guide !== config.search && guide !== config.command)
  ) {
    return guide;
  }

  const displaced =
    config.search === guide ? previousConfig.search : previousConfig.command;
  if (
    displaced !== "off" &&
    displaced !== config.search &&
    displaced !== config.command
  ) {
    return displaced;
  }
  return findAvailableShortcut([config.search, config.command]);
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
    case "mod-slash":
      return `${modifier}+/`;
    case "mod-shift-slash":
      return `${modifier}+Shift+/`;
    default:
      return "Off";
  }
}

export function isActiveShortcut(
  value: unknown,
): value is ActiveSpotlightShortcut {
  return SPOTLIGHT_SHORTCUT_OPTIONS.includes(value as ActiveSpotlightShortcut);
}

export function isShortcut(value: unknown): value is SpotlightShortcut {
  return value === "off" || isActiveShortcut(value);
}

function getAlternativeShortcut(
  shortcut: SpotlightShortcut,
): "mod-p" | "mod-shift-p" {
  return shortcut === "mod-p" ? "mod-shift-p" : "mod-p";
}

function findAvailableShortcut(
  excluded: readonly SpotlightShortcut[],
): ActiveSpotlightShortcut {
  return (
    SPOTLIGHT_SHORTCUT_OPTIONS.find(
      (shortcut) => !excluded.includes(shortcut),
    ) || "mod-p"
  );
}
