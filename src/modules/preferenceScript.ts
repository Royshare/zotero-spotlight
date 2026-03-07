import { config } from "../../package.json";
import { getPref, setPref } from "../utils/prefs";

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
  const shortcut = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-shortcut`,
  );
  if (shortcut) {
    const value = normalizeShortcutMode(getPref("shortcutMode"));
    setShortcutElementValue(shortcut, value);
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
}

function bindPrefEvents() {
  if (!addon.data.prefs?.window) {
    return;
  }
  const doc = addon.data.prefs.window.document;
  const shortcut = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-shortcut`,
  );
  bindShortcutEvents(shortcut);
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
  const resetButton = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-reset-defaults`,
  ) as HTMLButtonElement | null;
  resetButton?.addEventListener("click", () => {
    setPref("resultsLimit", 20);
    (setPref as any)("windowHeight", 400);
    (setPref as any)("windowWidth", 560);
    (setPref as any)("searchAnnotations", true);
    (setPref as any)("restoreSearch", false);
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

type ShortcutMode = "primary" | "fallback";

function bindShortcutEvents(shortcut: Element | null) {
  if (!shortcut) {
    return;
  }
  const updateShortcutPref: EventListener = () => {
    const value = getShortcutElementValue(shortcut);
    setPref("shortcutMode", value);
  };
  if (isXulRadioGroup(shortcut)) {
    shortcut.addEventListener("select", updateShortcutPref);
    shortcut.addEventListener("command", updateShortcutPref);
    return;
  }
  shortcut.querySelectorAll('input[type="radio"]').forEach((node: Element) => {
    const input = node as HTMLInputElement;
    input.addEventListener("change", updateShortcutPref);
  });
}

function normalizeShortcutMode(value: unknown): ShortcutMode {
  return value === "fallback" ? "fallback" : "primary";
}

function isXulRadioGroup(
  element: Element | null,
): element is XUL.RadioGroup & Element {
  return element?.localName === "radiogroup";
}

function getShortcutElementValue(shortcut: Element): ShortcutMode {
  if (isXulRadioGroup(shortcut)) {
    return normalizeShortcutMode(shortcut.value);
  }
  const selected = shortcut.querySelector(
    'input[type="radio"]:checked',
  ) as HTMLInputElement | null;
  return normalizeShortcutMode(selected?.value);
}

function setShortcutElementValue(shortcut: Element, value: ShortcutMode): void {
  if (isXulRadioGroup(shortcut)) {
    shortcut.value = value;
    return;
  }
  shortcut.querySelectorAll('input[type="radio"]').forEach((node: Element) => {
    const input = node as HTMLInputElement;
    input.checked = input.value === value;
  });
}
