// cover is an Open Library cover id, not a URL.
export type Book = { title: string; author: string; cover?: number };
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
      const { cover } = book as Record<string, unknown>;
      // An invalid cover is dropped; it does not reject the library.
      parsedBooks.push(isCoverId(cover) ? { title, author, cover } : { title, author });
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

export function bookErrors(book: Book): { title: string | null; author: string | null } {
  return {
    title: book.title.trim() === "" ? "Enter a title." : null,
    author: book.author.trim() === "" ? "Enter an author." : null,
  };
}
