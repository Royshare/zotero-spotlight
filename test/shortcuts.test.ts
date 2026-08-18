import { assert } from "chai";
import {
  assignSpotlightShortcut,
  getShortcutFromEvent,
  resolveShortcutConfig,
  resolveSpotlightShortcut,
} from "../src/modules/spotlight/shortcuts";

describe("Spotlight shortcuts", function () {
  it("resolves independently configured shortcuts", function () {
    const config = resolveShortcutConfig("mod-k", "mod-o", "primary", true);
    assert.equal(resolveSpotlightShortcut("mod-k", config), "search");
    assert.equal(resolveSpotlightShortcut("mod-o", config), "command");
    assert.equal(resolveSpotlightShortcut("mod-p", config), null);
  });

  it("migrates the legacy primary and fallback modes", function () {
    assert.deepEqual(resolveShortcutConfig("", "", "primary", true), {
      search: "mod-p",
      command: "mod-shift-p",
    });
    assert.deepEqual(resolveShortcutConfig("", "", "fallback", true), {
      search: "mod-shift-p",
      command: "mod-p",
    });
  });

  it("preserves a disabled legacy command shortcut", function () {
    assert.deepEqual(resolveShortcutConfig("", "", "primary", false), {
      search: "mod-p",
      command: "off",
    });
  });

  it("recognizes the supported keyboard presets", function () {
    const event = (
      key: string,
      shiftKey = false,
    ): Parameters<typeof getShortcutFromEvent>[0] => ({
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey,
      key,
      code: `Key${key.toUpperCase()}`,
    });
    assert.equal(getShortcutFromEvent(event("p"), false), "mod-p");
    assert.equal(getShortcutFromEvent(event("p", true), false), "mod-shift-p");
    assert.equal(getShortcutFromEvent(event("k"), false), "mod-k");
    assert.equal(getShortcutFromEvent(event("o"), false), "mod-o");
    assert.equal(getShortcutFromEvent(event("k", true), false), null);
  });

  it("swaps assignments when a selected shortcut is already in use", function () {
    const defaults = { search: "mod-p", command: "mod-shift-p" } as const;
    assert.deepEqual(
      assignSpotlightShortcut(defaults, "search", "mod-shift-p"),
      { search: "mod-shift-p", command: "mod-p" },
    );
    assert.deepEqual(assignSpotlightShortcut(defaults, "command", "mod-p"), {
      search: "mod-shift-p",
      command: "mod-p",
    });
  });

  it("moves search to an available default when enabling a conflicting command", function () {
    const commandOff = { search: "mod-k", command: "off" } as const;
    assert.deepEqual(assignSpotlightShortcut(commandOff, "command", "mod-k"), {
      search: "mod-p",
      command: "mod-k",
    });
  });
});
