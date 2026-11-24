import { assert } from "chai";
import {
  getAttachmentResultType,
  isLinkedUrlAttachment,
} from "../src/modules/spotlight/itemMetadata";
import {
  parseStructuredQuery,
  SearchService,
} from "../src/modules/spotlight/search";

function fakeAttachment(linkMode: number, contentType = ""): Zotero.Item {
  return {
    isAttachment: () => true,
    attachmentLinkMode: linkMode,
    attachmentContentType: contentType,
    isPDFAttachment: () => contentType === "application/pdf",
  } as unknown as Zotero.Item;
}

describe("linked web attachments", function () {
  describe("classification", function () {
    it("classifies Link to URI attachments as links", function () {
      const link = fakeAttachment(Zotero.Attachments.LINK_MODE_LINKED_URL);

      assert.isTrue(isLinkedUrlAttachment(link));
      assert.equal(getAttachmentResultType(link), "link");
    });

    it("keeps stored files and snapshots out of the link type", function () {
      const pdf = fakeAttachment(
        Zotero.Attachments.LINK_MODE_IMPORTED_FILE,
        "application/pdf",
      );
      const snapshot = fakeAttachment(
        Zotero.Attachments.LINK_MODE_IMPORTED_URL,
        "text/html",
      );

      assert.isFalse(isLinkedUrlAttachment(pdf));
      assert.equal(getAttachmentResultType(pdf), "pdf");
      assert.isFalse(isLinkedUrlAttachment(snapshot));
      assert.equal(getAttachmentResultType(snapshot), "snapshot");
    });

    it("parses the :link type filter", function () {
      const query = parseStructuredQuery(":link pubmed");

      assert.equal(query.textQuery, "pubmed");
      assert.deepEqual(Array.from(query.filters.types), ["link"]);
    });
  });

  describe("search", function () {
    // A nonsense token keeps these results apart from any real library data.
    const token = "qzvlinktest";
    let parent: Zotero.Item;
    let childLink: Zotero.Item;
    let standaloneLink: Zotero.Item;
    let service: SearchService;

    before(async function () {
      parent = new Zotero.Item("journalArticle");
      parent.setField("title", `${token} parent article`);
      await parent.saveTx();
      childLink = await Zotero.Attachments.linkFromURL({
        url: "https://pubmed.example.org/childpage",
        parentItemID: parent.id,
        title: "Publisher page",
      });
      standaloneLink = await Zotero.Attachments.linkFromURL({
        url: `https://docs.example.org/${token}-standalone`,
        title: "Standalone reference page",
      });
      service = new SearchService();
    });

    after(async function () {
      service?.destroy();
      await standaloneLink?.eraseTx();
      await parent?.eraseTx();
    });

    async function search(query: string) {
      return service.search(query, Zotero.getMainWindow(), 50);
    }

    it("finds a link by its URL", async function () {
      const results = await search("pubmed.example.org/childpage");
      const link = results.find((result) => result.id === childLink.id);

      assert.exists(link);
      assert.equal(link!.resultType, "link");
    });

    it("lets a child link inherit its parent's metadata", async function () {
      const results = await search(`${token} parent`);
      const ids = results.map((result) => result.id);

      assert.include(ids, childLink.id);
    });

    it("keeps the parent item searchable alongside its link", async function () {
      const results = await search(`${token} parent`);
      const parentResult = results.find((result) => result.id === parent.id);

      assert.exists(parentResult);
      assert.equal(parentResult!.resultType, "item");
    });

    it("shows a standalone link's URL as its subtitle", async function () {
      const results = await search(`${token}-standalone`);
      const link = results.find((result) => result.id === standaloneLink.id);

      assert.exists(link);
      assert.equal(link!.resultType, "link");
      assert.include(link!.subtitle, `${token}-standalone`);
    });

    it("restricts results to links with :link", async function () {
      const results = await search(`:link ${token}`);

      assert.isNotEmpty(results);
      for (const result of results) {
        assert.equal(result.resultType, "link");
      }
    });
  });
});
