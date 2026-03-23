import type { SpotlightCommandDefinition } from "./commands";
import {
  getActiveProvider,
  getProviderLabel,
  isAIConfigured,
  isAIEnabled,
} from "./llmProvider";
import { buildItemContext, hasItemContext } from "./aiContext";

export function createAICommands(): SpotlightCommandDefinition[] {
  return [
    createAskCommand(),
    createSummarizeCommand(),
    createDraftNoteCommand(),
  ];
}

function createAskCommand(): SpotlightCommandDefinition {
  return {
    id: "ai-ask",
    title: "Ask",
    subtitle: "Ask a question about the current paper",
    keywords: ["ai", "ask", "question", "query", "gpt", "llm", "explain"],
    contexts: ["main", "reader", "note"],
    group: "AI",
    icon: "ai",
    acceptsArgs: true,
    isAvailable: ({ activeItem }) => {
      if (!isAIEnabled()) {
        return { enabled: false };
      }
      if (!activeItem || !activeItem.isRegularItem()) {
        return { enabled: false, reason: "Select a library item first" };
      }
      return { enabled: true };
    },
    run: async ({ activeItem, queryArgs, stream }) => {
      if (!stream) {
        return;
      }
      if (!isAIConfigured()) {
        stream.error(
          "Enable AI and add your API key in Spotlight preferences to use AI commands.",
        );
        return;
      }
      const question = stripCommandKeyword(queryArgs || "", "ask");
      if (!question) {
        stream.error(
          "Type a question after '>ask' — e.g. '>ask what is the main contribution?'",
        );
        return;
      }
      if (!activeItem) {
        stream.error("No item selected.");
        return;
      }
      stream.begin(`Ask · ${question}`);
      const context = buildItemContext(activeItem);
      let fullText = "";
      try {
        const provider = getActiveProvider();
        await provider.stream(
          [
            {
              role: "system",
              content:
                "You are a research assistant. Answer questions about the academic paper described below. Be concise and accurate. Use only information from the provided context.",
            },
            {
              role: "user",
              content: `${context}\n\nQuestion: ${question}`,
            },
          ],
          (chunk) => {
            fullText += chunk;
            stream.append(chunk);
          },
          stream.signal,
        );
        const capturedItem = activeItem;
        const capturedQuestion = question;
        const capturedAnswer = fullText;
        stream.end({
          label: "Save as Note",
          run: async () => {
            await saveQANote(capturedItem, capturedQuestion, capturedAnswer);
          },
        });
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "AbortError") {
          return;
        }
        stream.error(
          `Could not reach AI provider: ${(err as { message?: string })?.message || "Unknown error"}. Check your API key and connection.`,
        );
      }
    },
  };
}

function createSummarizeCommand(): SpotlightCommandDefinition {
  return {
    id: "ai-summarize",
    title: "Summarize",
    subtitle: "Summarize the current paper's abstract and highlights",
    keywords: ["ai", "summarize", "summary", "tldr", "abstract", "gpt", "llm"],
    contexts: ["main", "reader", "note"],
    group: "AI",
    icon: "ai",
    isAvailable: ({ activeItem }) => {
      if (!isAIEnabled()) {
        return { enabled: false };
      }
      if (!activeItem || !activeItem.isRegularItem()) {
        return { enabled: false, reason: "Select a library item first" };
      }
      if (!hasItemContext(activeItem)) {
        return {
          enabled: false,
          reason: "Item has no abstract or annotations to summarize",
        };
      }
      return { enabled: true };
    },
    run: async ({ activeItem, stream }) => {
      if (!stream) {
        return;
      }
      if (!isAIConfigured()) {
        stream.error(
          "Enable AI and add your API key in Spotlight preferences to use AI commands.",
        );
        return;
      }
      if (!activeItem) {
        stream.error("No item selected.");
        return;
      }
      stream.begin(`Summarize · ${activeItem.getDisplayTitle?.() || "paper"}`);
      const context = buildItemContext(activeItem);
      let fullText = "";
      try {
        const provider = getActiveProvider();
        await provider.stream(
          [
            {
              role: "system",
              content:
                "You are a research assistant. Summarize the following paper in 3-5 sentences. Focus on: what problem it solves, the key method or contribution, and the main result or finding.",
            },
            {
              role: "user",
              content: context,
            },
          ],
          (chunk) => {
            fullText += chunk;
            stream.append(chunk);
          },
          stream.signal,
        );
        const capturedItem = activeItem;
        const capturedSummary = fullText;
        stream.end({
          label: "Save as Note",
          run: async () => {
            await saveSummaryNote(capturedItem, capturedSummary);
          },
        });
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "AbortError") {
          return;
        }
        stream.error(
          `Could not reach AI provider: ${(err as { message?: string })?.message || "Unknown error"}. Check your API key and connection.`,
        );
      }
    },
  };
}

function createDraftNoteCommand(): SpotlightCommandDefinition {
  return {
    id: "ai-draft-note",
    title: "Draft Note",
    subtitle: "Draft a reading note with AI-generated insights",
    keywords: [
      "ai",
      "draft",
      "note",
      "reading note",
      "literature note",
      "write",
      "gpt",
      "llm",
    ],
    contexts: ["main", "reader", "note"],
    group: "AI",
    icon: "ai",
    isAvailable: ({ pane, activeItem }) => {
      if (!isAIEnabled()) {
        return { enabled: false };
      }
      if (!pane) {
        return { enabled: false, reason: "Main Zotero pane is unavailable" };
      }
      if (typeof pane.canEdit === "function" && !pane.canEdit()) {
        return { enabled: false, reason: "Selected library is read-only" };
      }
      if (!activeItem || !activeItem.isRegularItem()) {
        return { enabled: false, reason: "Select a library item first" };
      }
      if (!hasItemContext(activeItem)) {
        return {
          enabled: false,
          reason: "Item has no abstract or annotations to draft from",
        };
      }
      return { enabled: true };
    },
    run: async ({ activeItem, pane, stream }) => {
      if (!stream) {
        return;
      }
      if (!isAIConfigured()) {
        stream.error(
          "Enable AI and add your API key in Spotlight preferences to use AI commands.",
        );
        return;
      }
      if (!activeItem || !pane) {
        stream.error("No item selected.");
        return;
      }
      stream.begin(
        `Draft Note · ${activeItem.getDisplayTitle?.() || "paper"}`,
      );
      const context = buildItemContext(activeItem);
      const modelLabel = getProviderLabel();
      let fullText = "";
      try {
        const provider = getActiveProvider();
        await provider.stream(
          [
            {
              role: "system",
              content:
                "You are a research assistant helping a scholar write a structured reading note. Using the provided paper context, fill in the following sections concisely: Key Contribution, Main Ideas (as a list), Evidence and Methods, Open Questions, and Connections to other work. Use plain text, not markdown.",
            },
            {
              role: "user",
              content: context,
            },
          ],
          (chunk) => {
            fullText += chunk;
            stream.append(chunk);
          },
          stream.signal,
        );
        const capturedItem = activeItem;
        const capturedPane = pane;
        const capturedText = fullText;
        const capturedModel = modelLabel;
        stream.end({
          label: "Save as Note",
          run: async () => {
            await saveDraftNote(
              capturedItem,
              capturedPane,
              capturedText,
              capturedModel,
            );
          },
        });
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "AbortError") {
          return;
        }
        stream.error(
          `Could not reach AI provider: ${(err as { message?: string })?.message || "Unknown error"}. Check your API key and connection.`,
        );
      }
    },
  };
}

// ── Note creation helpers ──────────────────────────────────────────────────────

async function saveQANote(
  item: Zotero.Item,
  question: string,
  answer: string,
): Promise<void> {
  const title = escapeHTML(item.getDisplayTitle?.() || "Untitled");
  const note = new Zotero.Item("note");
  note.libraryID = item.libraryID;
  (note as any).parentID = item.id;
  note.setNote(`
    <h2>${escapeHTML(question)}</h2>
    <p>${escapeHTML(answer).replace(/\n/g, "<br>")}</p>
    <p><em>Source: ${title}</em></p>
  `);
  await note.saveTx();
}

async function saveSummaryNote(
  item: Zotero.Item,
  summary: string,
): Promise<void> {
  const title = escapeHTML(item.getDisplayTitle?.() || "Untitled");
  const note = new Zotero.Item("note");
  note.libraryID = item.libraryID;
  (note as any).parentID = item.id;
  note.setNote(`
    <h2>Summary</h2>
    <h3>${title}</h3>
    <p>${escapeHTML(summary).replace(/\n/g, "<br>")}</p>
  `);
  await note.saveTx();
}

async function saveDraftNote(
  item: Zotero.Item,
  pane: _ZoteroTypes.ZoteroPane,
  content: string,
  modelLabel: string,
): Promise<void> {
  const title = escapeHTML(item.getDisplayTitle?.() || "Untitled");
  const note = new Zotero.Item("note");
  note.libraryID = item.libraryID;
  (note as any).parentID = item.id;
  note.setNote(`
    <h1>Reading Note</h1>
    <h2>${title}</h2>
    <p>${escapeHTML(content).replace(/\n/g, "<br>")}</p>
    <p><em>Drafted with ${escapeHTML(modelLabel)}</em></p>
  `);
  await note.saveTx();
  try {
    const notes = (Zotero as any).Notes;
    if (notes?.open) {
      await notes.open(note.id, null, { openInWindow: false });
      return;
    }
  } catch {
    // fallback
  }
  pane.selectItem?.(note.id);
}

function stripCommandKeyword(queryArgs: string, keyword: string): string {
  return queryArgs.replace(new RegExp(`^${keyword}\\s*`, "i"), "").trim();
}

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
