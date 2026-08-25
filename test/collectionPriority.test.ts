import { assert } from "chai";
import {
  buildPriorityTemplate,
  getMatchOptions,
  getResultTypeRank,
  includesUnlistedAsLow,
  parsePriorityConfig,
  restrictsToSelectedLibraries,
  serializePriorityConfig,
  type PriorityConfig,
} from "../src/modules/spotlight/collectionPriority";
import {
  DEFAULT_MATCH_OPTIONS,
  scoreQuery,
} from "../src/modules/spotlight/matching";

const EMPTY_CONFIG = {
  libraries: [],
  includeUnlisted: false,
  resultTypes: {},
  matching: { ...DEFAULT_MATCH_OPTIONS },
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
        matching: { mode: "loose", typoDistance: 1, minTokenLength: 4 },
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

    it("accepts the link result type", function () {
      const linkConfig = parsePriorityConfig(
        '{"resultTypes":{"link":2,"bogus":9}}',
      );
      assert.deepEqual(linkConfig.resultTypes, { link: 2 });
      assert.equal(getResultTypeRank("link", linkConfig), 2);
    });
  });

  describe("matching options", function () {
    it("defaults to field mode when missing or invalid", function () {
      assert.equal(getMatchOptions(parsePriorityConfig(null)).mode, "field");
      assert.equal(
        getMatchOptions(parsePriorityConfig('{"order":[]}')).mode,
        "field",
      );
      assert.equal(
        getMatchOptions(
          parsePriorityConfig('{"order":[],"matching":{"mode":"bogus"}}'),
        ).mode,
        "field",
      );
    });

    it("parses explicit loose and field modes", function () {
      assert.equal(
        getMatchOptions(
          parsePriorityConfig('{"order":[],"matching":{"mode":"loose"}}'),
        ).mode,
        "loose",
      );
      assert.equal(
        getMatchOptions(
          parsePriorityConfig('{"order":[],"matching":{"mode":"field"}}'),
        ).mode,
        "field",
      );
    });

    it("clamps typoDistance and minTokenLength to valid ranges", function () {
      const options = getMatchOptions(
        parsePriorityConfig(
          '{"order":[],"matching":{"typoDistance":99,"minTokenLength":-5}}',
        ),
      );
      assert.equal(options.typoDistance, 3);
      assert.equal(options.minTokenLength, 1);
    });
  });

  describe("scoreQuery (token-based field mode)", function () {
    // Abstract-style text that contains the k…u…o subsequence of 'kuo'
    // scattered across words but no actual 'kuo' word.
    const fields = [
      "OpenPose realtime multi-person pose estimation",
      "Cao 2019",
      "ask you to cite",
    ];
    const looseText =
      "openpose realtime multi-person pose estimation cao 2019 ask you to cite";
    const defaults = { ...DEFAULT_MATCH_OPTIONS };

    it("matches exact words regardless of case", function () {
      assert.isAbove(scoreQuery("kuo", ["Kuo 2019"], "kuo 2019", defaults), 0);
    });

    it("does not match letters scattered across words", function () {
      assert.equal(scoreQuery("kuo", fields, looseText, defaults), -1);
    });

    it("allows minor typos for long-enough tokens", function () {
      assert.isAbove(
        scoreQuery(
          "machien",
          ["machine learning"],
          "machine learning",
          defaults,
        ),
        0,
      );
      assert.isAbove(
        scoreQuery(
          "lerning",
          ["machine learning"],
          "machine learning",
          defaults,
        ),
        0,
      );
    });

    it("requires exact short tokens when minTokenLength excludes them", function () {
      const strictShort = { ...defaults, minTokenLength: 99 };
      assert.equal(
        scoreQuery("kou", ["kuo 2019"], "kuo 2019", strictShort),
        -1,
      );
      assert.isAbove(
        scoreQuery("kuo", ["kuo 2019"], "kuo 2019", strictShort),
        0,
      );
    });

    it("disables typo tolerance with typoDistance 0", function () {
      const noTypo = { ...defaults, typoDistance: 0 };
      assert.equal(
        scoreQuery("machien", ["machine learning"], "machine learning", noTypo),
        -1,
      );
    });

    it("supports prefix matches", function () {
      assert.isAbove(
        scoreQuery("mach", ["machine learning"], "machine learning", defaults),
        0,
      );
    });

    it("requires all query tokens to match (AND semantics)", function () {
      assert.isAbove(
        scoreQuery(
          "gait prince",
          ["Gait Disorders", "Prince 1997"],
          "gait disorders prince 1997",
          defaults,
        ),
        0,
      );
      assert.equal(
        scoreQuery(
          "gait zzzzq",
          ["Gait Disorders", "Prince 1997"],
          "gait disorders prince 1997",
          defaults,
        ),
        -1,
      );
    });

    it("still matches loosely in loose mode", function () {
      // 'donelan' traces across this concatenation but matches no single word.
      const legacyFields = ["gait disorders", "prince plan", "1997"];
      const legacyText = "gait disorders prince plan 1997";
      assert.isAbove(
        scoreQuery("donelan", legacyFields, legacyText, {
          ...defaults,
          mode: "loose",
        }),
        0,
      );
      assert.equal(
        scoreQuery("donelan", legacyFields, legacyText, defaults),
        -1,
      );
    });
  });
});
