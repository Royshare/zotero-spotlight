import { assert } from "chai";
import { parseCollectionModeQuery } from "../src/modules/spotlight/collectionSearch";

describe("collection search query", function () {
  it("recognizes the collection prefix", function () {
    assert.deepEqual(parseCollectionModeQuery(":col machine learning"), {
      isCollectionMode: true,
      query: "machine learning",
    });
  });

  it("recognizes the short alias without a query", function () {
    assert.deepEqual(parseCollectionModeQuery("  :COL  "), {
      isCollectionMode: true,
      query: "",
    });
  });

  it("does not recognize the long collection prefix", function () {
    assert.deepEqual(parseCollectionModeQuery(":collection notes"), {
      isCollectionMode: false,
      query: ":collection notes",
    });
  });
});
