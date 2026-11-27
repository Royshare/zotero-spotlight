import { assert } from "chai";
import {
  RANKABLE_RESULT_TYPES,
  compareResultTypePriority,
  getResultTypeTier,
  parseResultTypePriorities,
  serializeResultTypePriorities,
} from "../src/modules/spotlight/resultTypePriority";

describe("result type priorities", function () {
  describe("rankable types", function () {
    it("lists every non-annotation result type", function () {
      assert.deepEqual(
        [...RANKABLE_RESULT_TYPES],
        ["item", "note", "pdf", "epub", "snapshot", "link"],
      );
    });
  });

  describe("parseResultTypePriorities", function () {
    it("reads type:rank pairs", function () {
      assert.deepEqual(parseResultTypePriorities("pdf:1,item:2"), {
        pdf: 1,
        item: 2,
      });
    });

    it("returns no priorities for empty or non-string input", function () {
      assert.deepEqual(parseResultTypePriorities(""), {});
      assert.deepEqual(parseResultTypePriorities(undefined), {});
      assert.deepEqual(parseResultTypePriorities(42), {});
    });

    it("ignores spaces around entries", function () {
      assert.deepEqual(parseResultTypePriorities(" pdf : 1 , note:3 "), {
        pdf: 1,
        note: 3,
      });
    });

    it("lets several types share a rank", function () {
      assert.deepEqual(parseResultTypePriorities("pdf:1,epub:1"), {
        pdf: 1,
        epub: 1,
      });
    });

    it("drops unknown types and annotations", function () {
      assert.deepEqual(
        parseResultTypePriorities("annotation:1,video:2,link:3"),
        { link: 3 },
      );
    });

    it("drops ranks that are not whole numbers from 1 to 6", function () {
      assert.deepEqual(
        parseResultTypePriorities(
          "item:0,note:7,pdf:1.5,epub:x,snapshot:-1,link:6",
        ),
        { link: 6 },
      );
    });

    it("drops malformed entries and keeps the rest", function () {
      assert.deepEqual(parseResultTypePriorities("pdf,:2,item:2,,note:"), {
        item: 2,
      });
    });

    it("keeps the first rank when a type repeats", function () {
      assert.deepEqual(parseResultTypePriorities("pdf:1,pdf:4"), { pdf: 1 });
    });
  });

  describe("serializeResultTypePriorities", function () {
    it("writes ranks in order, ties in the standard type order", function () {
      assert.equal(
        serializeResultTypePriorities({ link: 2, note: 1, item: 2 }),
        "note:1,item:2,link:2",
      );
    });

    it("writes an empty string when nothing is ranked", function () {
      assert.equal(serializeResultTypePriorities({}), "");
    });

    it("round-trips through the parser", function () {
      const raw = "epub:1,item:2,snapshot:2,link:5";
      assert.equal(
        serializeResultTypePriorities(parseResultTypePriorities(raw)),
        raw,
      );
    });
  });

  describe("getResultTypeTier", function () {
    const priorities = { pdf: 1, item: 2 };

    it("returns the rank of a ranked type", function () {
      assert.equal(getResultTypeTier(priorities, "pdf"), 1);
      assert.equal(getResultTypeTier(priorities, "item"), 2);
    });

    it("puts unranked types after every ranked type", function () {
      assert.equal(getResultTypeTier(priorities, "note"), Infinity);
      assert.equal(getResultTypeTier(priorities, "annotation"), Infinity);
    });
  });

  describe("compareResultTypePriority", function () {
    const priorities = { pdf: 1, item: 2 };
    const compare = (a: string, b: string) =>
      compareResultTypePriority(
        priorities,
        { resultType: a },
        { resultType: b },
      );

    it("puts a higher-priority type first", function () {
      assert.isBelow(compare("pdf", "item"), 0);
      assert.isAbove(compare("item", "pdf"), 0);
    });

    it("puts ranked types before unranked ones", function () {
      assert.isBelow(compare("item", "note"), 0);
      assert.isAbove(compare("link", "item"), 0);
    });

    it("leaves types with the same rank to relevance", function () {
      const tied = { pdf: 1, epub: 1 };
      assert.equal(
        compareResultTypePriority(
          tied,
          { resultType: "pdf" },
          { resultType: "epub" },
        ),
        0,
      );
    });

    it("leaves two unranked types to relevance", function () {
      assert.equal(compare("note", "link"), 0);
    });

    it("changes nothing when no priorities are set", function () {
      for (const a of RANKABLE_RESULT_TYPES) {
        for (const b of RANKABLE_RESULT_TYPES) {
          assert.equal(
            compareResultTypePriority({}, { resultType: a }, { resultType: b }),
            0,
          );
        }
      }
    });

    it("sorts a mixed list by tier, then by score", function () {
      const results = [
        { id: 1, resultType: "note", score: 90 },
        { id: 2, resultType: "item", score: 50 },
        { id: 3, resultType: "pdf", score: 10 },
        { id: 4, resultType: "item", score: 80 },
        { id: 5, resultType: "link", score: 95 },
      ];
      const sorted = [...results].sort(
        (a, b) =>
          compareResultTypePriority(priorities, a, b) || b.score - a.score,
      );
      assert.deepEqual(
        sorted.map((r) => r.id),
        [3, 4, 2, 5, 1],
      );
    });
  });
});
