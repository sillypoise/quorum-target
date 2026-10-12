import { isCoverId, type Book } from "./library.ts";

export type SearchResult =
  | { kind: "ok"; books: Book[] }
  | { kind: "failed"; reason: "network" | "status" | "malformed" | "timeout" }
  | { kind: "cancelled" };

const SEARCH_URL = "https://openlibrary.org/search.json";
const LIMIT = 10;
export const TIMEOUT_MS = 8000;

// default=false makes a missing cover answer 404 (so <img onError> fires) instead of a placeholder.
export const coverUrl = (id: number) =>
  `https://covers.openlibrary.org/b/id/${id}-S.jpg?default=false`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const nonBlank = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

function toBook(doc: unknown): Book | null {
  if (!isRecord(doc)) return null;
  const title = nonBlank(doc.title);
  if (!title) return null;
  const names = Array.isArray(doc.author_name) ? doc.author_name : [];
  const author = names.map(nonBlank).find((name) => name !== null) ?? "Unknown author";
  return isCoverId(doc.cover_i) ? { title, author, cover: doc.cover_i } : { title, author };
}

// Always resolves; never rejects.
export async function searchBooks(
  query: string,
  signal: AbortSignal,
  fetchFn: typeof fetch = (...args) => globalThis.fetch(...args),
): Promise<SearchResult> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal.aborted) return { kind: "cancelled" };
  signal.addEventListener("abort", abort);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const url = `${SEARCH_URL}?${new URLSearchParams({
    q: query,
    fields: "title,author_name,cover_i",
    limit: String(LIMIT),
  })}`;
  try {
    const response = await fetchFn(url, { signal: controller.signal });
    if (!response.ok) return { kind: "failed", reason: "status" };
    const data: unknown = await response.json();
    if (!isRecord(data) || !Array.isArray(data.docs)) return { kind: "failed", reason: "malformed" };
    const books = data.docs.map(toBook).filter((book): book is Book => book !== null);
    return { kind: "ok", books: books.slice(0, LIMIT) };
  } catch (error) {
    if (signal.aborted) return { kind: "cancelled" };
    if (timedOut) return { kind: "failed", reason: "timeout" };
    // response.json() rejects with a SyntaxError for malformed JSON.
    return { kind: "failed", reason: error instanceof SyntaxError ? "malformed" : "network" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
