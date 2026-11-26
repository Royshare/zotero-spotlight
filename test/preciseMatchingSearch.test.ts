import { assert } from "chai";
import { SearchService } from "../src/modules/spotlight/search";
import { getPref, setPref } from "../src/utils/prefs";

describe("precise matching in search", function () {
  // A nonsense token keeps these results apart from any real library data.
  const token = "qzvmatchtest";
  let savedMode: string;
  let item: Zotero.Item;
  let service: SearchService;

  before(async function () {
    savedMode = getPref("matchMode");
    item = new Zotero.Item("journalArticle");
    // "k", "u", "o" appear in order across these words, but "kuo" is no word.
    item.setField("title", `${token} ask you to cite`);
    await item.saveTx();
    service = new SearchService();
  });

  after(async function () {
    setPref("matchMode", savedMode ?? "fuzzy");
    service?.destroy();
    await item?.eraseTx();
  });

  async function finds(query: string) {
    const results = await service.search(query, Zotero.getMainWindow(), 50);
    return results.some((result) => result.id === item.id);
  }

  it("keeps fuzzy matching by default", async function () {
    setPref("matchMode", "fuzzy");

    assert.isTrue(await finds(`${token} kuo`));
  });

  it("rejects scattered letters in precise mode", async function () {
    setPref("matchMode", "precise");

    assert.isFalse(await finds(`${token} kuo`));
  });

  it("matches whole words and typos in precise mode", async function () {
    setPref("matchMode", "precise");

    assert.isTrue(await finds(`${token} cite`));
    assert.isTrue(await finds(`${token} ctie`));
  });
});
