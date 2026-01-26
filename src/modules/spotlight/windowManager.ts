import { ActionHandler } from "./actions";
import { PaletteUI } from "./palette";
import { SearchService } from "./search";
import { isWindowAlive } from "../../utils/window";
import { getPref } from "../../utils/prefs";

type WindowListener = {
  onOpenWindow: (xulWindow: unknown) => void;
  onCloseWindow: (xulWindow: unknown) => void;
  onWindowTitleChange: () => void;
};

export class WindowManager {
  private palettes = new Map<Window, PaletteUI>();
  private keyListeners = new Map<Window, (event: KeyboardEvent) => void>();
  private windowListener: WindowListener | null = null;

  start(): void {
    this.registerExistingWindows();
    this.registerWindowListener();
  }

  shutdown(): void {
    this.unregisterWindowListener();
    for (const win of Array.from(this.palettes.keys())) {
      this.unregisterWindow(win);
    }
  }

  registerWindow(win: Window): void {
    if (!isWindowAlive(win) || this.palettes.has(win)) {
      return;
    }
    if (!isSupportedWindow(win)) {
      return;
    }
    const searchService = new SearchService();
    const palette = new PaletteUI(win, searchService, new ActionHandler());
    searchService.warmIndex().catch((error) => {
      ztoolkit.log("Spotlight index warmup failed", error);
    });
    const handler = (event: KeyboardEvent) => {
      if (!isToggleEvent(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      palette.toggle();
    };
    win.addEventListener("keydown", handler, true);
    win.addEventListener(
      "unload",
      () => {
        this.unregisterWindow(win);
      },
      { once: true },
    );
    this.palettes.set(win, palette);
    this.keyListeners.set(win, handler);
  }

  unregisterWindow(win: Window): void {
    const palette = this.palettes.get(win);
    if (palette) {
      palette.destroy();
    }
    const handler = this.keyListeners.get(win);
    if (handler) {
      win.removeEventListener("keydown", handler, true);
    }
    this.palettes.delete(win);
    this.keyListeners.delete(win);
  }

  togglePalette(win: Window): void {
    const palette = this.palettes.get(win);
    if (palette) {
      palette.toggle();
    }
  }

  private registerExistingWindows(): void {
    const Services = ztoolkit.getGlobal("Services");
    const enumerator = Services.wm.getEnumerator(null);
    while (enumerator.hasMoreElements()) {
      const win = enumerator.getNext() as Window;
      if (!isWindowAlive(win)) {
        continue;
      }
      if (win.document.readyState === "complete") {
        this.registerWindow(win);
      } else {
        win.addEventListener(
          "load",
          () => {
            this.registerWindow(win);
          },
          { once: true },
        );
      }
    }
  }

  private registerWindowListener(): void {
    const Services = ztoolkit.getGlobal("Services");
    const Ci = Components.interfaces;
    this.windowListener = {
      onOpenWindow: (xulWindow) => {
        const domWindow = (xulWindow as any)
          .QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIDOMWindow) as Window;
        domWindow.addEventListener(
          "load",
          () => {
            this.registerWindow(domWindow);
          },
          { once: true },
        );
      },
      onCloseWindow: (xulWindow) => {
        const domWindow = (xulWindow as any)
          .QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIDOMWindow) as Window;
        this.unregisterWindow(domWindow);
      },
      onWindowTitleChange: () => {},
    };
    Services.wm.addListener(this.windowListener);
  }

  private unregisterWindowListener(): void {
    if (!this.windowListener) {
      return;
    }
    const Services = ztoolkit.getGlobal("Services");
    Services.wm.removeListener(this.windowListener);
    this.windowListener = null;
  }
}

function isSupportedWindow(win: Window): boolean {
  const doc = win.document;
  const windowType = doc?.documentElement?.getAttribute("windowtype");
  if (windowType === "zotero:main" || windowType === "zotero:reader") {
    return true;
  }
  const candidate = win as any;
  if (candidate.ZoteroPane || candidate.Zotero_Tabs) {
    return true;
  }
  if (candidate.Reader || candidate.ZoteroReader) {
    return true;
  }
  return false;
}

function isToggleEvent(event: KeyboardEvent): boolean {
  if (event.altKey) {
    return false;
  }
  const key = event.key?.toLowerCase();
  const code = event.code;
  const isMac = Zotero.isMac;
  const modifier = isMac ? event.metaKey : event.ctrlKey;
  if (!modifier) {
    return false;
  }
  const isMatch = key === "p" || code === "KeyP";
  if (!isMatch) {
    return false;
  }
  const shortcutMode = (getPref("shortcutMode") || "primary") as string;
  if (shortcutMode === "fallback") {
    return event.shiftKey;
  }
  if (shortcutMode === "primary") {
    return !event.shiftKey;
  }
  return true;
}
