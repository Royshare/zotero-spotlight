import { assert } from "chai";
import {
  buildPriorityTemplate,
  getResultTypeRank,
  includesUnlistedAsLow,
  parsePriorityConfig,
  restrictsToSelectedLibraries,
  serializePriorityConfig,
  type PriorityConfig,
} from "../src/modules/spotlight/collectionPriority";

const EMPTY_CONFIG = {
  libraries: [],
  includeUnlisted: false,
  resultTypes: {},
};

describe("library selection config", function () {
  describe("parsePriorityConfig", function () {
    it("returns an empty config for null/undefined/empty input", function () {
      assert.deepEqual(parsePriorityConfig(null), EMPTY_CONFIG);
      assert.deepEqual(parsePriorityConfig(undefined), EMPTY_CONFIG);
      assert.deepEqual(parsePriorityConfig(""), EMPTY_CONFIG);
    });

    it("returns an empty config for invalid JSON", function () {
      assert.deepEqual(parsePriorityConfig("{not json"), EMPTY_CONFIG);
    });

    it("parses library ids, dropping duplicates and malformed entries", function () {
      const config = parsePriorityConfig(
        '{"libraries":[10,"one",20,20,null,30]}',
      );
      assert.deepEqual(config.libraries, [10, 20, 30]);
    });

    it("defaults includeUnlisted to false (excluded)", function () {
      const config = parsePriorityConfig('{"libraries":[1]}');
      assert.equal(config.includeUnlisted, false);
      assert.isTrue(restrictsToSelectedLibraries(config));
      assert.isFalse(includesUnlistedAsLow(config));
    });

    it("supports the lower-ranked mode for unlisted libraries", function () {
      const config = parsePriorityConfig(
        '{"libraries":[1],"includeUnlisted":true}',
      );
      assert.isFalse(restrictsToSelectedLibraries(config));
      assert.isTrue(includesUnlistedAsLow(config));
    });

    it("imposes no restriction when no libraries are selected", function () {
      assert.isFalse(restrictsToSelectedLibraries(EMPTY_CONFIG));
      assert.isFalse(includesUnlistedAsLow(EMPTY_CONFIG));
    });
  });

  describe("result type ranks", function () {
    const configJSON =
      '{"order":[],"resultTypes":{"item":1,"pdf":2,"bogus":9,"note":"high","epub":0}}';

    it("keeps valid types with integer ranks >= 1", function () {
      const config = parsePriorityConfig(configJSON);
      assert.deepEqual(config.resultTypes, { item: 1, pdf: 2 });
    });

    it("resolves ranks; unranked types have none", function () {
      const config = parsePriorityConfig(configJSON);
      assert.equal(getResultTypeRank("item", config), 1);
      assert.equal(getResultTypeRank("pdf", config), 2);
      assert.equal(getResultTypeRank("note", config), undefined);
      assert.equal(getResultTypeRank("bogus", config), undefined);
    });
  });

  describe("serializePriorityConfig", function () {
    it("round-trips through parse", function () {
      const original = {
        libraries: [3, 7],
        includeUnlisted: true,
        resultTypes: { item: 1, pdf: 2 },
      } as PriorityConfig;
      const roundTripped = parsePriorityConfig(
        serializePriorityConfig(original),
      );
      assert.deepEqual(roundTripped, original);
    });
  });

  describe("buildPriorityTemplate", function () {
    it("produces parseable JSON listing library ids", function () {
      const template = buildPriorityTemplate([
        { libraryID: 1, name: "My Library" },
        { libraryID: 281631, name: "Manuscript Lab" },
      ]);
      const config = parsePriorityConfig(template);
      assert.deepEqual(config.libraries, [1, 281631]);
      assert.deepEqual(config.resultTypes, {});
      assert.equal(config.includeUnlisted, false);
      // Names survive serialization as display hints only.
      const raw = JSON.parse(template);
      assert.equal(raw.libraries.length, 2);
    });
  });
});
