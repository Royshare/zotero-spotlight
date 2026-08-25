import { config } from "../../package.json";
import { getPref, setPref } from "../utils/prefs";
import {
  assignSpotlightShortcut,
  resolveShortcutConfig,
} from "./spotlight/shortcuts";
import {
  PRIORITIZED_RESULT_TYPES,
  type PriorityConfig,
  type PrioritizedResultType,
  emptyPriorityConfig,
  parsePriorityConfig,
  serializePriorityConfig,
} from "./spotlight/collectionPriority";

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
  if (searchShortcutSelect && commandShortcutSelect) {
    const shortcuts = getConfiguredShortcuts();
    searchShortcutSelect.value = shortcuts.search;
    commandShortcutSelect.value = shortcuts.command;
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
  const prioritiesTextarea = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-collection-priorities`,
  ) as HTMLTextAreaElement | null;
  if (prioritiesTextarea) {
    const val = (getPref as any)("collectionPriorities") as string | null;
    prioritiesTextarea.value = serializePriorityConfig(
      parsePriorityConfig(typeof val === "string" ? val : null),
    );
  }
  renderPriorityControls(doc);
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
  bindShortcutEvents(searchShortcutSelect, commandShortcutSelect);
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
  bindPrioritiesGui(doc);
  const resetButton = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-reset-defaults`,
  ) as HTMLButtonElement | null;
  resetButton?.addEventListener("click", () => {
    setPref("shortcutMode", "primary");
    setPref("commandShortcutEnabled", true);
    setPref("searchShortcut", "mod-p");
    setPref("commandShortcut", "mod-shift-p");
    setPref("resultsLimit", 20);
    (setPref as any)("windowHeight", 400);
    (setPref as any)("windowWidth", 560);
    (setPref as any)("searchAnnotations", true);
    (setPref as any)("restoreSearch", false);
    (setPref as any)("showFilterHintBar", true);
    syncPrefUI();
  });
}

function getPriorityConfigFromPref(): PriorityConfig {
  const val = (getPref as any)("collectionPriorities") as string | null;
  return parsePriorityConfig(typeof val === "string" ? val : null);
}

function savePriorityConfig(doc: Document, next: PriorityConfig): void {
  const canonical = serializePriorityConfig(next);
  (setPref as any)("collectionPriorities", canonical);
  const textarea = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-collection-priorities`,
  ) as HTMLTextAreaElement | null;
  if (textarea) {
    textarea.value = canonical;
  }
  updatePriorityStatus(doc, null, true);
}

function priorityGuiQuery(doc: Document, suffix: string): HTMLElement | null {
  return doc.querySelector(`#zotero-prefpane-${config.addonRef}-${suffix}`);
}

function renderPriorityLibraries(doc: Document, config: PriorityConfig): void {
  const container = priorityGuiQuery(doc, "priority-libraries");
  if (!container) {
    return;
  }
  container.replaceChildren();
  const selected = new Set(config.libraries);
  for (const library of Zotero.Libraries.getAll()) {
    if (
      library.archived ||
      (library.libraryType !== "user" && library.libraryType !== "group")
    ) {
      continue;
    }
    const row = doc.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    const checkbox = doc.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.has(library.libraryID);
    checkbox.addEventListener("change", () => {
      const next = getPriorityConfigFromPref();
      const set = new Set(next.libraries);
      if (checkbox.checked) {
        set.add(library.libraryID);
      } else {
        set.delete(library.libraryID);
      }
      next.libraries = Array.from(set);
      savePriorityConfig(doc, next);
    });
    const label = doc.createElement("label");
    label.textContent =
      library.libraryType === "group"
        ? `${library.name || "Library"} (group)`
        : library.name || "Library";
    row.appendChild(checkbox);
    row.appendChild(label);
    container.appendChild(row);
  }
}

function renderResultTypeTiers(doc: Document, config: PriorityConfig): void {
  const container = priorityGuiQuery(doc, "result-tiers");
  if (!container) {
    return;
  }
  container.replaceChildren();
  const rankOf = (type: PrioritizedResultType) => config.resultTypes[type];
  const ranked = PRIORITIZED_RESULT_TYPES.filter(
    (type) => typeof rankOf(type) === "number",
  ).sort((a, b) => (rankOf(a) as number) - (rankOf(b) as number));

  const typeLabels: Record<PrioritizedResultType, string> = {
    item: "Item",
    note: "Note",
    pdf: "PDF",
    epub: "EPUB",
    snapshot: "Snapshot",
    annotation: "Annotation",
    link: "Link",
  };

  for (const type of PRIORITIZED_RESULT_TYPES) {
    const currentRank = rankOf(type);
    const row = doc.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    const label = doc.createElement("label");
    label.textContent = typeLabels[type];
    label.style.minWidth = "90px";
    const select = doc.createElement("select") as HTMLSelectElement;
    const unrankedOption = doc.createElement("option");
    unrankedOption.value = "";
    unrankedOption.textContent = "—";
    select.appendChild(unrankedOption);
    // Positions 1..rankedCount; an unranked type may also take the next slot.
    const positionCount =
      currentRank === undefined ? ranked.length + 1 : ranked.length;
    for (let position = 1; position <= positionCount; position += 1) {
      const option = doc.createElement("option");
      option.value = String(position);
      option.textContent = String(position);
      select.appendChild(option);
    }
    select.value = currentRank === undefined ? "" : String(currentRank);
    select.addEventListener("change", () => {
      const next = getPriorityConfigFromPref();
      const withoutType = PRIORITIZED_RESULT_TYPES.filter(
        (entry) => entry !== type && next.resultTypes[entry] !== undefined,
      ).sort(
        (a, b) =>
          (next.resultTypes[a] as number) - (next.resultTypes[b] as number),
      );
      delete next.resultTypes[type];
      const rawValue = select.value;
      if (rawValue !== "") {
        const position = Math.max(
          1,
          Math.min(
            rawValue === "" ? withoutType.length : Number(rawValue),
            withoutType.length + 1,
          ),
        );
        withoutType.splice(position - 1, 0, type);
        withoutType.forEach((entry, index) => {
          next.resultTypes[entry] = index + 1;
        });
      } else {
        withoutType.forEach((entry, index) => {
          next.resultTypes[entry] = index + 1;
        });
      }
      savePriorityConfig(doc, next);
      renderResultTypeTiers(doc, getPriorityConfigFromPref());
    });
    row.appendChild(label);
    row.appendChild(select);
    container.appendChild(row);
  }
}

function renderPriorityControls(doc: Document): void {
  const current = getPriorityConfigFromPref();
  renderPriorityLibraries(doc, current);
  renderResultTypeTiers(doc, current);
  const unlistedCheckbox = priorityGuiQuery(
    doc,
    "priority-unlisted",
  ) as HTMLInputElement | null;
  if (unlistedCheckbox) {
    unlistedCheckbox.checked = current.includeUnlisted;
  }
}

function bindPrioritiesGui(doc: Document): void {
  const unlistedCheckbox = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-priority-unlisted`,
  ) as HTMLInputElement | null;
  unlistedCheckbox?.addEventListener("change", () => {
    const next = getPriorityConfigFromPref();
    next.includeUnlisted = unlistedCheckbox.checked;
    savePriorityConfig(doc, next);
  });

  const prioritiesTextareaBind = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-collection-priorities`,
  ) as HTMLTextAreaElement | null;
  const prioritiesStatus = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-collection-priorities-status`,
  );
  prioritiesTextareaBind?.addEventListener("change", () => {
    let valid = false;
    try {
      JSON.parse(prioritiesTextareaBind.value);
      valid = true;
    } catch (_) {
      valid = false;
    }
    if (valid) {
      // Canonicalize (drops malformed lines) and persist.
      const canonical = serializePriorityConfig(
        parsePriorityConfig(prioritiesTextareaBind.value),
      );
      prioritiesTextareaBind.value = canonical;
      (setPref as any)("collectionPriorities", canonical);
      renderPriorityControls(doc);
    }
    updatePriorityStatus(doc, prioritiesStatus, valid);
  });

  renderPriorityControls(doc);
}

function updatePriorityStatus(
  doc: Document,
  statusEl: Element | null,
  valid: boolean,
) {
  if (!statusEl) {
    return;
  }
  const l10nID = valid
    ? "pref-priority-status-valid"
    : "pref-priority-status-invalid";
  try {
    (doc as any).l10n?.setAttributes?.(statusEl, l10nID);
  } catch (_) {
    statusEl.textContent = valid ? "Saved." : "Invalid JSON — not saved.";
  }
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

function bindShortcutEvents(
  searchSelect: HTMLSelectElement | null,
  commandSelect: HTMLSelectElement | null,
) {
  if (!searchSelect || !commandSelect) {
    return;
  }
  let configured = getConfiguredShortcuts();

  const applyShortcuts = (next: typeof configured) => {
    configured = next;
    searchSelect.value = next.search;
    commandSelect.value = next.command;
    setPref("searchShortcut", next.search);
    setPref("commandShortcut", next.command);
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
}
