export interface Book {
  id: number;
  title: string;
  author: string;
  status: "Reading" | "Up next" | "Finished";
  note: string;
  tags: string[];
}

const BOOKS_STORAGE_KEY = "pocket-library:reading-list";

const BOOKS: Book[] = [
  { id: 1, title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", status: "Reading", note: "", tags: [] },
  { id: 2, title: "The Dispossessed", author: "Ursula K. Le Guin", status: "Up next", note: "", tags: [] },
  { id: 3, title: "Kindred", author: "Octavia E. Butler", status: "Up next", note: "", tags: [] },
];

function isBookList(value: unknown): value is Book[] {
  return Array.isArray(value) && value.every((book) =>
    typeof book === "object" && book !== null &&
    "id" in book && typeof book.id === "number" && Number.isFinite(book.id) &&
    "title" in book && typeof book.title === "string" && book.title.trim().length > 0 &&
    "author" in book && typeof book.author === "string" && book.author.trim().length > 0 &&
    "status" in book && (book.status === "Reading" || book.status === "Up next" || book.status === "Finished") &&
    (!("note" in book) || typeof book.note === "string") &&
    (!("tags" in book) || (Array.isArray(book.tags) && book.tags.every((tag: unknown) => typeof tag === "string"))),
  );
}

export function parseTags(value: string): string[] {
  return value.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}

export function loadBooks(): Book[] {
  try {
    const stored = window.localStorage.getItem(BOOKS_STORAGE_KEY);
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (isBookList(parsed)) return parsed.map((book) => ({ ...book, note: book.note ?? "", tags: book.tags ?? [] }));
    }
  } catch {
    // Storage may be unavailable or contain malformed data; use the seed list.
  }
  return BOOKS;
}

export function saveBooks(books: Book[]): void {
  try {
    window.localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(books));
  } catch {
    // Keep the in-memory reading list usable when storage is unavailable or full.
  }
}
