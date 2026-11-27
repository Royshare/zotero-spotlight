import { assert } from "chai";
import {
  createMatchOptions,
  DEFAULT_MATCH_OPTIONS,
  scorePreciseMatch,
  type MatchOptions,
} from "../src/modules/spotlight/matching";
import { scoreSearchText } from "../src/modules/spotlight/textMatching";

const precise: MatchOptions = {
  mode: "precise",
  typoTolerance: 1,
  minTypoWordLength: 4,
};

/** Score a query against a single field. */
function score(query: string, field: string, options = precise): number {
  return scorePreciseMatch(query, [field], options);
}

describe("precise matching", function () {
  describe("options", function () {
    it("defaults to the existing fuzzy matching", function () {
      assert.deepEqual(DEFAULT_MATCH_OPTIONS, {
        mode: "fuzzy",
        typoTolerance: 1,
        minTypoWordLength: 4,
      });
      assert.deepEqual(
        createMatchOptions(undefined, undefined, undefined),
        DEFAULT_MATCH_OPTIONS,
      );
    });

    it("accepts the precise mode and falls back to fuzzy otherwise", function () {
      assert.equal(createMatchOptions("precise", 1, 4).mode, "precise");
      assert.equal(createMatchOptions("fuzzy", 1, 4).mode, "fuzzy");
      assert.equal(createMatchOptions("field", 1, 4).mode, "fuzzy");
    });

    it("clamps typo tolerance to 0-2 and minimum typo length to 1-20", function () {
      assert.equal(createMatchOptions("precise", -3, 4).typoTolerance, 0);
      assert.equal(createMatchOptions("precise", 9, 4).typoTolerance, 2);
      assert.equal(createMatchOptions("precise", 1.6, 4).typoTolerance, 2);
      assert.equal(createMatchOptions("precise", 1, 0).minTypoWordLength, 1);
      assert.equal(createMatchOptions("precise", 1, 99).minTypoWordLength, 20);
    });

    it("uses defaults for non-numeric values", function () {
      const options = createMatchOptions("precise", "x", null);

      assert.equal(options.typoTolerance, 1);
      assert.equal(options.minTypoWordLength, 4);
    });
  });

  describe("exact words", function () {
    it("matches a whole word regardless of case", function () {
      assert.isAbove(score("kuo", "Kuo 2019"), 0);
      assert.isAbove(score("KUO", "kuo 2019"), 0);
    });

    it("does not match letters scattered across words", function () {
      // "k", "u", "o" occur in order here, but in no single word.
      assert.equal(score("kuo", "ask you to cite openpose"), -1);
    });

    it("treats punctuation as a word separator", function () {
      assert.isAbove(score("multi", "multi-person pose estimation"), 0);
      assert.isAbove(score("person", "multi-person pose estimation"), 0);
    });
  });

  describe("prefixes and parts of words", function () {
    it("matches the beginning of a word", function () {
      assert.isAbove(score("mach", "machine learning"), 0);
    });

    it("matches three or more letters inside a word", function () {
      assert.isAbove(score("pose", "openpose realtime"), 0);
    });

    it("ranks exact words above prefixes, and prefixes above inner parts", function () {
      const exact = score("pose", "pose estimation");
      const prefix = score("pose", "poses estimated");
      const inner = score("pose", "openpose estimation");

      assert.isAbove(exact, prefix);
      assert.isAbove(prefix, inner);
    });

    it("prefers a shorter word for the same prefix", function () {
      assert.isAbove(score("learn", "learns"), score("learn", "learnability"));
    });
  });

  describe("typos", function () {
    it("tolerates one edit in a long-enough word", function () {
      assert.isAbove(score("machien", "machine learning"), 0); // swapped letters
      assert.isAbove(score("lerning", "machine learning"), 0); // missing letter
      assert.isAbove(score("machime", "machine learning"), 0); // wrong letter
    });

    it("ranks a typo match below an exact match", function () {
      assert.isAbove(
        score("machine", "machine learning"),
        score("machien", "machine learning"),
      );
    });

    it("rejects more edits than the tolerance allows", function () {
      assert.equal(score("mcahien", "machine learning"), -1);
      assert.isAbove(
        score("mcahien", "machine learning", { ...precise, typoTolerance: 2 }),
        0,
      );
    });

    it("turns typos off with a tolerance of 0", function () {
      assert.equal(
        score("machien", "machine learning", { ...precise, typoTolerance: 0 }),
        -1,
      );
    });
  });

  describe("short words", function () {
    it("does not apply typo tolerance below the minimum word length", function () {
      // "kou" is one swap from "kuo", but three letters is below 4.
      assert.equal(score("kou", "kuo 2019"), -1);
      assert.isAbove(
        score("kou", "kuo 2019", { ...precise, minTypoWordLength: 3 }),
        0,
      );
    });

    it("matches a one-letter word only exactly", function () {
      assert.isAbove(score("j", "j smith"), 0);
      assert.equal(score("j", "john smith"), -1);
    });

    it("matches a two-letter word as a whole word or prefix only", function () {
      assert.isAbove(score("ml", "ml models"), 0);
      assert.isAbove(score("ml", "mlp models"), 0);
      assert.equal(score("ml", "html models"), -1);
    });
  });

  describe("multi-word queries", function () {
    it("requires every word to match", function () {
      assert.isAbove(score("gait prince", "gait disorders prince 1997"), 0);
      assert.equal(score("gait zzzzq", "gait disorders prince 1997"), -1);
    });

    it("lets different words match different fields", function () {
      const fields = ["Gait Disorders", "Prince 1997"];

      assert.isAbove(scorePreciseMatch("gait prince", fields, precise), 0);
    });

    it("does not match one word across two fields", function () {
      // "gaitprince" exists only if the two fields are glued together.
      const fields = ["gait", "prince"];

      assert.equal(scorePreciseMatch("gaitprince", fields, precise), -1);
    });

    it("scores more matching words higher", function () {
      assert.isAbove(
        score("machine learning", "machine learning"),
        score("machine", "machine learning"),
      );
    });

    it("ignores word order", function () {
      assert.isAbove(score("learning machine", "machine learning"), 0);
    });
  });

  describe("edge cases", function () {
    it("returns -1 for a query with no words", function () {
      assert.equal(score("  --  ", "machine learning"), -1);
      assert.equal(score("", "machine learning"), -1);
    });

    it("returns -1 when there are no fields", function () {
      assert.equal(scorePreciseMatch("machine", [], precise), -1);
    });

    it("matches numbers as words", function () {
      assert.isAbove(score("2019", "kuo 2019"), 0);
    });
  });

  describe("CJK queries", function () {
    it("finds a CJK substring inside an unspaced title", function () {
      assert.isAbove(score("学习", "深度学习方法"), 0);
    });

    it("scores CJK queries with the script-aware matcher", function () {
      const fields = ["基于页岩油的研究", "张三"];

      assert.equal(
        scorePreciseMatch("页岩油", fields, precise),
        scoreSearchText("页岩油", fields.join(" ")),
      );
    });
  });
});
