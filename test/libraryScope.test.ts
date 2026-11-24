import { assert } from "chai";
import {
  createLibraryScope,
  getLibraryTier,
  isLibraryExcluded,
  parseLibraryIDList,
  serializeLibraryIDList,
} from "../src/modules/spotlight/libraryScope";
import { SearchService } from "../src/modules/spotlight/search";
import { getPref, setPref } from "../src/utils/prefs";

describe("default library scope", function () {
  describe("preference parsing", function () {
    it("parses library IDs, dropping duplicates and invalid entries", function () {
      assert.deepEqual(parseLibraryIDList("3, 1,x,3,,-2,1.5"), [3, 1]);
    });

    it("treats a missing or empty pref as no unselected libraries", function () {
      assert.deepEqual(parseLibraryIDList(""), []);
      assert.deepEqual(parseLibraryIDList(undefined), []);
    });

    it("serializes IDs sorted and without duplicates", function () {
      assert.equal(serializeLibraryIDList([5, 1, 5, 3]), "1,3,5");
    });

    it("defaults to excluding unselected libraries", function () {
      assert.equal(createLibraryScope("1", undefined).mode, "exclude");
      assert.equal(createLibraryScope("1", "bogus").mode, "exclude");
      assert.equal(createLibraryScope("1", "lower").mode, "lower");
    });
  });

  describe("scoping rules", function () {
    it("searches every library when nothing is unselected", function () {
      const scope = createLibraryScope("", "exclude");

      assert.isFalse(isLibraryExcluded(scope, 1, false));
      assert.equal(getLibraryTier(scope, 1), 0);
    });

    it("excludes unselected libraries in exclude mode", function () {
      const scope = createLibraryScope("2", "exclude");

      assert.isTrue(isLibraryExcluded(scope, 2, false));
      assert.isFalse(isLibraryExcluded(scope, 1, false));
    });

    it("never excludes a library when the search is collection-scoped", function () {
      const scope = createLibraryScope("2", "exclude");

      assert.isFalse(isLibraryExcluded(scope, 2, true));
    });

    it("keeps unselected libraries in lower mode, in a later tier", function () {
      const scope = createLibraryScope("2", "lower");

      assert.isFalse(isLibraryExcluded(scope, 2, false));
      assert.equal(getLibraryTier(scope, 2), 1);
      assert.equal(getLibraryTier(scope, 1), 0);
    });
  });

  describe("search", function () {
    // A nonsense token keeps these results apart from any real library data.
    const token = "qzvscopetest";
    let savedUnselected: string;
    let savedMode: string;
    let item: Zotero.Item;
    let collection: Zotero.Collection;
    let service: SearchService;

    before(async function () {
      savedUnselected = getPref("unselectedLibraries");
      savedMode = getPref("unselectedLibraryMode");
      collection = new Zotero.Collection();
      collection.name = `${token} collection`;
      await collection.saveTx();
      item = new Zotero.Item("journalArticle");
      item.setField("title", `${token} scoped article`);
      item.addToCollection(collection.id);
      await item.saveTx();
      service = new SearchService();
    });

    after(async function () {
      setPref("unselectedLibraries", savedUnselected ?? "");
      setPref("unselectedLibraryMode", savedMode ?? "exclude");
      service?.destroy();
      await item?.eraseTx();
      await collection?.eraseTx();
    });

    function setScope(unselected: string, mode: string) {
      setPref("unselectedLibraries", unselected);
      setPref("unselectedLibraryMode", mode);
    }

    async function findItem(collectionFilter: unknown = null) {
      const results = await service.search(
        token,
        Zotero.getMainWindow(),
        50,
        collectionFilter,
      );
      return results.some((result) => result.id === item.id);
    }

    it("finds the item with the default all-libraries scope", async function () {
      setScope("", "exclude");

      assert.isTrue(await findItem());
    });

    it("hides the item when its library is unselected", async function () {
      setScope(String(Zotero.Libraries.userLibraryID), "exclude");

      assert.isFalse(await findItem());
    });

    it("still finds the item in a current-collection search", async function () {
      setScope(String(Zotero.Libraries.userLibraryID), "exclude");

      assert.isTrue(await findItem(collection));
    });

    it("keeps the item searchable in lower-priority mode", async function () {
      setScope(String(Zotero.Libraries.userLibraryID), "lower");

      assert.isTrue(await findItem());
    });
  });
});
