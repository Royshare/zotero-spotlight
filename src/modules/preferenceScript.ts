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
}

function clampResultsLimit(value: number): number {
  if (Number.isNaN(value)) {
    return 20;
  }
  return Math.min(40, Math.max(5, value));
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
