// cover is an Open Library cover id, not a URL. dueDate is a calendar date, "YYYY-MM-DD".
// read is stored only when true.
export type Book = { title: string; author: string; cover?: number; dueDate?: string; read?: true };
export type DueStatus = "none" | "upcoming" | "approaching" | "due-today" | "overdue";
export type Collection = { name: string; books: Book[] };
export type Library = { collections: Collection[]; open: number };

// Bump when the stored shape changes; unknown versions are ignored, not migrated.
export const STORAGE_VERSION = 1;
export const STORAGE_KEY = "pocket-library";

export function seedLibrary(): Library {
  return {
    open: 0,
    collections: [
      {
        name: "Sci-fi",
        books: [
          { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin" },
          { title: "The Dispossessed", author: "Ursula K. Le Guin" },
          { title: "Kindred", author: "Octavia E. Butler" },
        ],
      },
    ],
  };
}

// Storage can be missing or throw (private mode, disabled cookies).
export function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const isCoverId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

// Days since the epoch for a valid "YYYY-MM-DD" string, or null. This is the one definition of a
// valid due date. Years start at 1000, so Date.UTC never maps a two-digit year to 19xx, and the
// round trip rejects dates it would roll over (2025-02-30).
function dayNumber(value: unknown): number | null {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1000) return null;
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  const same =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return same ? time / 86_400_000 : null;
}

export const isDueDate = (value: unknown): value is string => dayNumber(value) !== null;

const APPROACHING_DAYS = 14;

// Pure: the caller supplies today. Read books and books without a valid date are "none".
export function dueStatus(book: Book, today: string): { status: DueStatus; days: number } {
  const due = book.read ? null : dayNumber(book.dueDate);
  const now = dayNumber(today);
  if (due === null || now === null) return { status: "none", days: 0 };
  const days = due - now;
  if (days < 0) return { status: "overdue", days: -days };
  if (days === 0) return { status: "due-today", days: 0 };
  return { status: days <= APPROACHING_DAYS ? "approaching" : "upcoming", days };
}

// The only reader of the clock: the local calendar date, not the UTC one.
export function todayString(now: Date = new Date()): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

function parseLibrary(data: unknown): Library | null {
  if (typeof data !== "object" || data === null) return null;
  const { version, open, collections } = data as Record<string, unknown>;
  if (version !== STORAGE_VERSION || !Array.isArray(collections)) return null;
  if (collections.length === 0) return null;
  const parsed: Collection[] = [];
  for (const collection of collections) {
    if (typeof collection !== "object" || collection === null) return null;
    const { name, books } = collection as Record<string, unknown>;
    if (!isNonEmptyString(name) || !Array.isArray(books)) return null;
    const parsedBooks: Book[] = [];
    for (const book of books) {
      if (typeof book !== "object" || book === null) return null;
      const { title, author } = book as Record<string, unknown>;
      if (!isNonEmptyString(title) || !isNonEmptyString(author)) return null;
      const { cover, dueDate, read } = book as Record<string, unknown>;
      // Invalid optional fields are dropped from the book; they do not reject the library.
      const parsedBook: Book = { title, author };
      if (isCoverId(cover)) parsedBook.cover = cover;
      if (isDueDate(dueDate)) parsedBook.dueDate = dueDate;
      if (read === true) parsedBook.read = true;
      parsedBooks.push(parsedBook);
    }
    parsed.push({ name, books: parsedBooks });
  }
  const openIndex =
    Number.isInteger(open) && (open as number) >= 0 && (open as number) < parsed.length
      ? (open as number)
      : 0;
  return { collections: parsed, open: openIndex };
}

// Never throws: anything missing, unreadable or invalid yields the seed.
// The seed is only written when the next change is saved.
export function loadLibrary(storage: Storage | null): Library {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) return parseLibrary(JSON.parse(raw)) ?? seedLibrary();
  } catch {
    // fall through to the seed
  }
  return seedLibrary();
}

// Returns false when the write failed (for example, storage is full).
export function saveLibrary(storage: Storage | null, library: Library): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...library }));
    return true;
  } catch {
    return false;
  }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function hasBook(collection: Collection, book: Book): boolean {
  return collection.books.some(
    (item) => sameName(item.title, book.title) && sameName(item.author, book.author),
  );
}

export function addBookToOpen(library: Library, book: Book): Library {
  const collections = library.collections.map((item, index) =>
    index === library.open ? { ...item, books: [...item.books, book] } : item,
  );
  return { ...library, collections };
}

// Each validator returns an error message, or null when the input is acceptable.
export function collectionNameError(name: string, collections: Collection[]): string | null {
  if (name.trim() === "") return "Enter a collection name.";
  if (collections.some((collection) => sameName(collection.name, name))) {
    return `A collection named "${name.trim()}" already exists. Choose a different name.`;
  }
  return null;
}

// Empty input means "no due date" in a form, so only a non-empty invalid value is an error.
export function dueDateError(input: string): string | null {
  const value = input.trim();
  if (value === "" || isDueDate(value)) return null;
  return "Enter a real date as year-month-day, for example 2025-03-31.";
}

export function bookErrors(book: Book): { title: string | null; author: string | null } {
  return {
    title: book.title.trim() === "" ? "Enter a title." : null,
    author: book.author.trim() === "" ? "Enter an author." : null,
  };
}
