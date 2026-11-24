import { config } from "../../package.json";
import { getPref, setPref } from "../utils/prefs";
import { resolveModifiedEnterAction } from "./spotlight/actions";
import {
  getLibraryScope,
  serializeLibraryIDList,
} from "./spotlight/libraryScope";
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
  const enterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-enter-action`,
  ) as HTMLSelectElement | null;
  if (enterActionSelect) {
    enterActionSelect.value = resolveModifiedEnterAction(
      getPref("enterAction"),
      "open",
    );
  }
  const modifierEnterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-modifier-enter-action`,
  ) as HTMLSelectElement | null;
  if (modifierEnterActionSelect) {
    modifierEnterActionSelect.value = resolveModifiedEnterAction(
      getPref("modifierEnterAction"),
      "reveal",
    );
  }
  const shiftEnterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-shift-enter-action`,
  ) as HTMLSelectElement | null;
  if (shiftEnterActionSelect) {
    shiftEnterActionSelect.value = resolveModifiedEnterAction(
      getPref("shiftEnterAction"),
      "alternate",
    );
  }
  const altEnterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-alt-enter-action`,
  ) as HTMLSelectElement | null;
  if (altEnterActionSelect) {
    altEnterActionSelect.value = resolveModifiedEnterAction(
      getPref("altEnterAction"),
      "open",
    );
  }
  const modifierShiftEnterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-modifier-shift-enter-action`,
  ) as HTMLSelectElement | null;
  if (modifierShiftEnterActionSelect) {
    modifierShiftEnterActionSelect.value = resolveModifiedEnterAction(
      getPref("modifierShiftEnterAction"),
      "reveal",
    );
  }
  const modifierAltEnterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-modifier-alt-enter-action`,
  ) as HTMLSelectElement | null;
  if (modifierAltEnterActionSelect) {
    modifierAltEnterActionSelect.value = resolveModifiedEnterAction(
      getPref("modifierAltEnterAction"),
      "reveal",
    );
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
  renderLibraryScope(doc);
}

/** Libraries a user can choose for the default search scope. */
function getScopeLibraries() {
  return Zotero.Libraries.getAll().filter(
    (library) =>
      !library.archived &&
      (library.libraryType === "user" || library.libraryType === "group"),
  );
}

function renderLibraryScope(doc: Document) {
  const list = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-library-scope-list`,
  ) as HTMLElement | null;
  const lowerCheckbox = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-library-scope-lower`,
  ) as HTMLInputElement | null;
  const scope = getLibraryScope();
  if (lowerCheckbox) {
    lowerCheckbox.checked = scope.mode === "lower";
  }
  if (!list) {
    return;
  }
  list.replaceChildren();
  const libraries = getScopeLibraries();
  const selectedCount = libraries.filter(
    (library) => !scope.unselected.has(library.libraryID),
  ).length;
  for (const library of libraries) {
    const id = `zotero-prefpane-${config.addonRef}-library-scope-${library.libraryID}`;
    const row = doc.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    const checkbox = doc.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = id;
    checkbox.checked = !scope.unselected.has(library.libraryID);
    // Keep at least one library selected so normal search never comes up
    // empty because of this setting alone.
    checkbox.disabled = checkbox.checked && selectedCount === 1;
    checkbox.addEventListener("change", () => {
      const unselected = new Set(getLibraryScope().unselected);
      if (checkbox.checked) {
        unselected.delete(library.libraryID);
      } else {
        unselected.add(library.libraryID);
      }
      setPref("unselectedLibraries", serializeLibraryIDList(unselected));
      renderLibraryScope(doc);
    });
    const label = doc.createElement("label");
    label.htmlFor = id;
    label.textContent = library.name;
    row.append(checkbox, label);
    list.appendChild(row);
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
  const enterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-enter-action`,
  ) as HTMLSelectElement | null;
  enterActionSelect?.addEventListener("change", () => {
    setPref(
      "enterAction",
      resolveModifiedEnterAction(enterActionSelect.value, "open"),
    );
  });
  const modifierEnterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-modifier-enter-action`,
  ) as HTMLSelectElement | null;
  modifierEnterActionSelect?.addEventListener("change", () => {
    setPref(
      "modifierEnterAction",
      resolveModifiedEnterAction(modifierEnterActionSelect.value, "reveal"),
    );
  });
  const shiftEnterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-shift-enter-action`,
  ) as HTMLSelectElement | null;
  shiftEnterActionSelect?.addEventListener("change", () => {
    setPref(
      "shiftEnterAction",
      resolveModifiedEnterAction(shiftEnterActionSelect.value, "alternate"),
    );
  });
  const altEnterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-alt-enter-action`,
  ) as HTMLSelectElement | null;
  altEnterActionSelect?.addEventListener("change", () => {
    setPref(
      "altEnterAction",
      resolveModifiedEnterAction(altEnterActionSelect.value, "open"),
    );
  });
  const modifierShiftEnterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-modifier-shift-enter-action`,
  ) as HTMLSelectElement | null;
  modifierShiftEnterActionSelect?.addEventListener("change", () => {
    setPref(
      "modifierShiftEnterAction",
      resolveModifiedEnterAction(
        modifierShiftEnterActionSelect.value,
        "reveal",
      ),
    );
  });
  const modifierAltEnterActionSelect = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-modifier-alt-enter-action`,
  ) as HTMLSelectElement | null;
  modifierAltEnterActionSelect?.addEventListener("change", () => {
    setPref(
      "modifierAltEnterAction",
      resolveModifiedEnterAction(modifierAltEnterActionSelect.value, "reveal"),
    );
  });
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
  const libraryScopeLowerCheckbox = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-library-scope-lower`,
  ) as HTMLInputElement | null;
  libraryScopeLowerCheckbox?.addEventListener("change", () => {
    setPref(
      "unselectedLibraryMode",
      libraryScopeLowerCheckbox.checked ? "lower" : "exclude",
    );
  });
  const resetButton = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-reset-defaults`,
  ) as HTMLButtonElement | null;
  resetButton?.addEventListener("click", () => {
    setPref("shortcutMode", "primary");
    setPref("commandShortcutEnabled", true);
    setPref("searchShortcut", "mod-p");
    setPref("commandShortcut", "mod-shift-p");
    setPref("guideShortcut", "mod-j");
    setPref("enterAction", "open");
    setPref("modifierEnterAction", "reveal");
    setPref("shiftEnterAction", "alternate");
    setPref("altEnterAction", "open");
    setPref("modifierShiftEnterAction", "reveal");
    setPref("modifierAltEnterAction", "reveal");
    setPref("resultsLimit", 20);
    (setPref as any)("windowHeight", 400);
    (setPref as any)("windowWidth", 560);
    (setPref as any)("searchAnnotations", true);
    (setPref as any)("restoreSearch", false);
    (setPref as any)("showFilterHintBar", true);
    setPref("unselectedLibraries", "");
    setPref("unselectedLibraryMode", "exclude");
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
