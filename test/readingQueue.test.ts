import { assert } from "chai";
import {
  getReadingQueueTarget,
  isInReadingQueue,
  READING_QUEUE_TAG,
  setReadingQueueState,
} from "../src/modules/spotlight/readingQueue";

type FakeItem = {
  id: number;
  tags: Array<{ tag: string }>;
  addTagCalls: string[];
  removeTagCalls: string[];
  saveCalls: number;
  isRegularItem: () => boolean;
  getTags: () => Array<{ tag: string }>;
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  saveTx: () => Promise<void>;
};

function createItem(tags: string[] = []): FakeItem {
  const item: FakeItem = {
    id: 1,
    tags: tags.map((tag) => ({ tag })),
    addTagCalls: [],
    removeTagCalls: [],
    saveCalls: 0,
    isRegularItem: () => true,
    getTags: () => item.tags,
    addTag: (tag) => {
      item.addTagCalls.push(tag);
      item.tags.push({ tag });
    },
    removeTag: (tag) => {
      item.removeTagCalls.push(tag);
      item.tags = item.tags.filter((entry) => entry.tag !== tag);
    },
    saveTx: async () => {
      item.saveCalls += 1;
    },
  };
  return item;
}

describe("reading queue", function () {
  it("recognizes the portable queue tag case-insensitively", function () {
    const item = createItem([READING_QUEUE_TAG.toUpperCase()]);

    assert.equal(getReadingQueueTarget(item as Zotero.Item), item);
    assert.isTrue(isInReadingQueue(item as Zotero.Item));
  });

  it("adds the queue tag and saves the item", async function () {
    const item = createItem();

    await setReadingQueueState(item as Zotero.Item, true);

    assert.deepEqual(item.addTagCalls, [READING_QUEUE_TAG]);
    assert.equal(item.saveCalls, 1);
    assert.isTrue(isInReadingQueue(item as Zotero.Item));
  });

  it("removes the existing queue tag and saves the item", async function () {
    const storedTag = READING_QUEUE_TAG.toUpperCase();
    const item = createItem([storedTag]);

    await setReadingQueueState(item as Zotero.Item, false);

    assert.deepEqual(item.removeTagCalls, [storedTag]);
    assert.equal(item.saveCalls, 1);
    assert.isFalse(isInReadingQueue(item as Zotero.Item));
  });
});
