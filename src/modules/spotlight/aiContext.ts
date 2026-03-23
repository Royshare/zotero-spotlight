import {
  getItemAbstractSnippetSafe,
  getItemAuthorsSafe,
  getItemTitleSafe,
  getItemYearSafe,
  isPDFAttachment,
} from "./itemMetadata";

const MAX_ABSTRACT_CHARS = 2000;
const MAX_ANNOTATIONS = 30;
const MAX_ANNOTATION_TEXT = 400;

export function buildItemContext(item: Zotero.Item): string {
  const title = getItemTitleSafe(item);
  const authors = getItemAuthorsSafe(item);
  const year = getItemYearSafe(item);
  const abstract = getFullAbstract(item);
  const annotations = gatherAnnotations(item);

  const lines: string[] = [];
  lines.push(`Title: ${title}`);
  if (authors) lines.push(`Authors: ${authors}`);
  if (year) lines.push(`Year: ${year}`);
  if (abstract) {
    lines.push("");
    lines.push("Abstract:");
    lines.push(abstract);
  }
  if (annotations.length) {
    lines.push("");
    lines.push("Annotations:");
    for (const ann of annotations) {
      const page = ann.page ? `[p. ${ann.page}] ` : "";
      if (ann.text) {
        lines.push(`${page}"${ann.text}"`);
      }
      if (ann.comment) {
        lines.push(`  Note: ${ann.comment}`);
      }
    }
  }
  return lines.join("\n");
}

export function hasItemContext(item: Zotero.Item): boolean {
  const abstract = getFullAbstract(item);
  if (abstract) return true;
  return gatherAnnotations(item).length > 0;
}

function getFullAbstract(item: Zotero.Item): string {
  try {
    const raw = String(
      item.getField("abstractNote", false as any, true as any) || "",
    );
    const stripped = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return stripped.slice(0, MAX_ABSTRACT_CHARS);
  } catch {
    return getItemAbstractSnippetSafe(item, MAX_ABSTRACT_CHARS);
  }
}

type AnnotationEntry = { text: string; comment: string; page: string };

function gatherAnnotations(item: Zotero.Item): AnnotationEntry[] {
  const candidate = item as any;
  const attachmentIDs: number[] =
    typeof candidate.getAttachments === "function"
      ? (candidate.getAttachments() as number[])
      : [];

  const entries: AnnotationEntry[] = [];
  for (const attachmentID of attachmentIDs) {
    const attachment = Zotero.Items.get(attachmentID) as Zotero.Item;
    if (!attachment || !isPDFAttachment(attachment)) {
      continue;
    }
    const rawAnnotations: any[] =
      typeof (attachment as any).getAnnotations === "function"
        ? ((attachment as any).getAnnotations() as any[])
        : [];

    const sorted = [...rawAnnotations].sort((a, b) => {
      const left = String(a.annotationSortIndex || "");
      const right = String(b.annotationSortIndex || "");
      return left.localeCompare(right, undefined, { numeric: true });
    });

    for (const ann of sorted) {
      const text = String(ann.annotationText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_ANNOTATION_TEXT);
      const comment = String(ann.annotationComment || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_ANNOTATION_TEXT);
      if (!text && !comment) continue;
      entries.push({
        text,
        comment,
        page: String(ann.annotationPageLabel || ""),
      });
      if (entries.length >= MAX_ANNOTATIONS) break;
    }
    if (entries.length >= MAX_ANNOTATIONS) break;
  }
  return entries;
}
