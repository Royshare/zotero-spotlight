import { assert } from "chai";
import { parseStructuredQuery } from "../src/modules/spotlight/search";
import { scoreSearchText } from "../src/modules/spotlight/textMatching";

describe("script-aware search matching", function () {
  it("matches a CJK substring in the middle of a title", function () {
    const score = scoreSearchText(
      "页岩油",
      "基于正交各向异性地震反演的页岩油储层裂缝预测",
    );

    assert.isAbove(score, 0);
  });

  it("matches mixed CJK and Latin queries", function () {
    const score = scoreSearchText(
      "页岩油 shale",
      "基于页岩油 shale reservoir 的研究",
    );

    assert.isAbove(score, 0);
  });

  it("keeps fuzzy character-sequence matches as a CJK fallback", function () {
    const exactSubstringScore = scoreSearchText("页岩油", "页岩油储层");
    const partialSequenceScore = scoreSearchText("页油", "页岩油储层");

    assert.isAbove(partialSequenceScore, 0);
    assert.isBelow(partialSequenceScore, exactSubstringScore);
  });

  it("preserves CJK text while parsing combined structured filters", function () {
    const query = parseStructuredQuery("页岩油 #储层 :pdf y:>=2020");

    assert.equal(query.textQuery, "页岩油");
    assert.deepEqual(query.filters.tags, ["储层"]);
    assert.deepEqual(Array.from(query.filters.types), ["pdf"]);
    assert.equal(query.filters.yearMin, 2020);
    assert.isAbove(scoreSearchText(query.textQuery, "研究：页岩油储层"), 0);
  });
});
