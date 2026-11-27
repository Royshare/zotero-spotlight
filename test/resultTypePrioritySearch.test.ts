import { assert } from "chai";
import { SearchService } from "../src/modules/spotlight/search";
import { getPref, setPref } from "../src/utils/prefs";

describe("result type priorities in search", function () {
  // A nonsense token keeps these results apart from any real library data.
  const token = "qzvtypeorder";
  let savedPriorities: string;
  let parent: Zotero.Item;
  let link: Zotero.Item;
  let service: SearchService;

  before(async function () {
    savedPriorities = getPref("resultTypePriorities");
    parent = new Zotero.Item("journalArticle");
    parent.setField("title", `${token} ranked article`);
    await parent.saveTx();
    // The child link inherits the parent's title, so both match the token.
    link = await Zotero.Attachments.linkFromURL({
      url: "https://example.org/type-order",
      parentItemID: parent.id,
      title: "Publisher page",
    });
    service = new SearchService();
  });

  after(async function () {
    setPref("resultTypePriorities", savedPriorities ?? "");
    service?.destroy();
    await parent?.eraseTx();
  });

  async function order(): Promise<number[]> {
    const results = await service.search(token, Zotero.getMainWindow(), 50);
    return results
      .map((result) => result.id)
      .filter((id) => id === parent.id || id === link.id);
  }

  it("finds both results with no priorities set", async function () {
    setPref("resultTypePriorities", "");

    assert.sameMembers(await order(), [parent.id, link.id]);
  });

  it("lists a prioritized link before its item", async function () {
    setPref("resultTypePriorities", "link:1");

    assert.deepEqual(await order(), [link.id, parent.id]);
  });

  it("lists a prioritized item before its link", async function () {
    setPref("resultTypePriorities", "item:1,link:2");

    assert.deepEqual(await order(), [parent.id, link.id]);
  });

  it("ignores an invalid setting", async function () {
    setPref("resultTypePriorities", "not a valid value");

    assert.sameMembers(await order(), [parent.id, link.id]);
  });
});
