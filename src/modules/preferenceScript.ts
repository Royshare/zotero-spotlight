import { config } from "../../package.json";
import { getPref, setPref } from "../utils/prefs";
import {
  assignGuideShortcut,
  assignSpotlightShortcut,
  reconcileGuideShortcut,
  resolveGuideShortcut,
  resolveShortcutConfig,
} from "./spotlight/shortcuts";

export async function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      columns: [],
      rows: [],
    };
  } else {
    addon.data.prefs.window = _window;
  }
  bindPrefEvents();
  syncPrefUI();
}

function syncPrefUI() {
  if (!addon.data.prefs?.window) {
    return;
  }
  const doc = addon.data.prefs.window.document;
  const searchShortcutSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-search-shortcut`,
  ) as HTMLSelectElement | null;
  const commandShortcutSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-command-shortcut`,
  ) as HTMLSelectElement | null;
  const guideShortcutSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-guide-shortcut`,
  ) as HTMLSelectElement | null;
  if (searchShortcutSelect && commandShortcutSelect && guideShortcutSelect) {
    const shortcuts = getConfiguredShortcuts();
    searchShortcutSelect.value = shortcuts.search;
    commandShortcutSelect.value = shortcuts.command;
    guideShortcutSelect.value = getConfiguredGuideShortcut();
  }
  const limitInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-results-limit`,
  ) as HTMLInputElement | null;
  if (limitInput) {
    const limit = clampResultsLimit(Number(getPref("resultsLimit")));
    limitInput.value = String(limit);
  }
  const heightInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-window-height`,
  ) as HTMLInputElement | null;
  if (heightInput) {
    heightInput.value = String(
      clampWindowHeight(Number((getPref as any)("windowHeight"))),
    );
  }
  const widthInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-window-width`,
  ) as HTMLInputElement | null;
  if (widthInput) {
    widthInput.value = String(
      clampWindowWidth(Number((getPref as any)("windowWidth"))),
    );
  }
  const annoCheckbox = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-search-annotations`,
  ) as HTMLInputElement | null;
  if (annoCheckbox) {
    const val = (getPref as any)("searchAnnotations");
    annoCheckbox.checked = val === undefined || val === null ? true : !!val;
  }
  const restoreCheckbox = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-restore-search`,
  ) as HTMLInputElement | null;
  if (restoreCheckbox) {
    restoreCheckbox.checked = !!(getPref as any)("restoreSearch");
  }
  const filterHintBarCheckbox = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-show-filter-hint-bar`,
  ) as HTMLInputElement | null;
  if (filterHintBarCheckbox) {
    const val = (getPref as any)("showFilterHintBar");
    filterHintBarCheckbox.checked =
      val === undefined || val === null ? true : !!val;
  }
}

function bindPrefEvents() {
  if (!addon.data.prefs?.window) {
    return;
  }
  const doc = addon.data.prefs.window.document;
  const searchShortcutSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-search-shortcut`,
  ) as HTMLSelectElement | null;
  const commandShortcutSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-command-shortcut`,
  ) as HTMLSelectElement | null;
  const guideShortcutSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-guide-shortcut`,
  ) as HTMLSelectElement | null;
  bindShortcutEvents(
    searchShortcutSelect,
    commandShortcutSelect,
    guideShortcutSelect,
  );
  const limitInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-results-limit`,
  ) as HTMLInputElement | null;
  limitInput?.addEventListener("change", () => {
    const value = clampResultsLimit(Number(limitInput.value));
    limitInput.value = String(value);
    setPref("resultsLimit", value);
  });
  const heightInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-window-height`,
  ) as HTMLInputElement | null;
  heightInput?.addEventListener("change", () => {
    const value = clampWindowHeight(Number(heightInput.value));
    heightInput.value = String(value);
    (setPref as any)("windowHeight", value);
  });
  const widthInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-window-width`,
  ) as HTMLInputElement | null;
  widthInput?.addEventListener("change", () => {
    const value = clampWindowWidth(Number(widthInput.value));
    widthInput.value = String(value);
    (setPref as any)("windowWidth", value);
  });
  const annoCheckbox = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-search-annotations`,
  ) as HTMLInputElement | null;
  annoCheckbox?.addEventListener("change", () => {
    (setPref as any)("searchAnnotations", annoCheckbox.checked);
  });
  const restoreCheckboxBind = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-restore-search`,
  ) as HTMLInputElement | null;
  restoreCheckboxBind?.addEventListener("change", () => {
    (setPref as any)("restoreSearch", restoreCheckboxBind.checked);
  });
  const filterHintBarCheckboxBind = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-show-filter-hint-bar`,
  ) as HTMLInputElement | null;
  filterHintBarCheckboxBind?.addEventListener("change", () => {
    (setPref as any)("showFilterHintBar", filterHintBarCheckboxBind.checked);
  });
  const resetButton = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-reset-defaults`,
  ) as HTMLButtonElement | null;
  resetButton?.addEventListener("click", () => {
    setPref("shortcutMode", "primary");
    setPref("commandShortcutEnabled", true);
    setPref("searchShortcut", "mod-p");
    setPref("commandShortcut", "mod-shift-p");
    setPref("guideShortcut", "mod-slash");
    setPref("resultsLimit", 20);
    (setPref as any)("windowHeight", 400);
    (setPref as any)("windowWidth", 560);
    (setPref as any)("searchAnnotations", true);
    (setPref as any)("restoreSearch", false);
    (setPref as any)("showFilterHintBar", true);
    syncPrefUI();
  });
}

function clampResultsLimit(value: number): number {
  if (Number.isNaN(value)) return 20;
  return Math.min(100, Math.max(5, value));
}

function clampWindowHeight(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 400;
  return Math.min(800, Math.max(200, value));
}

function clampWindowWidth(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 560;
  return Math.min(1200, Math.max(300, value));
}

function getConfiguredShortcuts() {
  return resolveShortcutConfig(
    getPref("searchShortcut"),
    getPref("commandShortcut"),
    getPref("shortcutMode"),
    getPref("commandShortcutEnabled"),
  );
}

function getConfiguredGuideShortcut() {
  return resolveGuideShortcut(getPref("guideShortcut"));
}

function bindShortcutEvents(
  searchSelect: HTMLSelectElement | null,
  commandSelect: HTMLSelectElement | null,
  guideSelect: HTMLSelectElement | null,
) {
  if (!searchSelect || !commandSelect || !guideSelect) {
    return;
  }
  let configured = getConfiguredShortcuts();
  let guide = getConfiguredGuideShortcut();

  const applyShortcuts = (next: typeof configured) => {
    guide = reconcileGuideShortcut(next, configured, guide);
    configured = next;
    searchSelect.value = next.search;
    commandSelect.value = next.command;
    guideSelect.value = guide;
    setPref("searchShortcut", next.search);
    setPref("commandShortcut", next.command);
    setPref("guideShortcut", guide);
  };

  searchSelect.addEventListener("change", () => {
    applyShortcuts(
      assignSpotlightShortcut(configured, "search", searchSelect.value),
    );
  });

  commandSelect.addEventListener("change", () => {
    applyShortcuts(
      assignSpotlightShortcut(configured, "command", commandSelect.value),
    );
  });

  guideSelect.addEventListener("change", () => {
    const next = assignGuideShortcut(configured, guide, guideSelect.value);
    configured = next.config;
    guide = next.guide;
    searchSelect.value = configured.search;
    commandSelect.value = configured.command;
    guideSelect.value = guide;
    setPref("searchShortcut", configured.search);
    setPref("commandShortcut", configured.command);
    setPref("guideShortcut", guide);
  });
}
