import { assert } from "chai";
import manifest from "../addon/manifest.json";
import { config } from "../package.json";

describe("startup", function () {
  it("should have plugin instance defined", function () {
    assert.isNotEmpty(Zotero[config.addonInstance]);
  });

  it("should allow installation on Zotero 10", function () {
    assert.equal(manifest.applications.zotero.strict_max_version, "10.*");
  });
});
