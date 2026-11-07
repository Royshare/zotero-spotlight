import { assert } from "chai";
import { config } from "../package.json";

describe("Spotlight toolkit", function () {
  it("provides the global access and logging used by Spotlight", function () {
    const toolkit = Zotero[config.addonInstance].data.ztoolkit;

    assert.equal(toolkit._version, "6.0.0");
    assert.isFunction(toolkit.getGlobal);
    assert.isFunction(toolkit.log);
    assert.equal(toolkit.getGlobal("Zotero"), Zotero);
    assert.equal(toolkit.basicOptions.api.pluginID, config.addonID);
  });

  it("does not register toolkit install or debugging URL handlers", function () {
    const toolkit = Zotero[config.addonInstance].data.ztoolkit;
    const services = toolkit.getGlobal("Services");
    const extensions =
      services.io.getProtocolHandler("zotero").wrappedJSObject._extensions;

    assert.isUndefined(extensions["zotero://plugin"]);
    assert.isUndefined(extensions["zotero://ztoolkit-debug"]);
    assert.notProperty(Zotero, "_toolkitGlobal");
  });
});
