import { useEffect, useRef, useState, type FormEvent } from "react";

interface Book {
  id: number;
  title: string;
  author: string;
  status: "Reading" | "Up next" | "Finished";
}

type StatusFilter = "All" | Book["status"];
type ShelfSort = "collection" | "title" | "author";

const BOOKS_STORAGE_KEY = "pocket-library:reading-list";

const BOOKS: Book[] = [
  { id: 1, title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", status: "Reading" },
  { id: 2, title: "The Dispossessed", author: "Ursula K. Le Guin", status: "Up next" },
  { id: 3, title: "Kindred", author: "Octavia E. Butler", status: "Up next" },
];

function isBookList(value: unknown): value is Book[] {
  return Array.isArray(value) && value.every((book) =>
    typeof book === "object" && book !== null &&
    "id" in book && typeof book.id === "number" && Number.isFinite(book.id) &&
    "title" in book && typeof book.title === "string" && book.title.trim().length > 0 &&
    "author" in book && typeof book.author === "string" && book.author.trim().length > 0 &&
    "status" in book && (book.status === "Reading" || book.status === "Up next" || book.status === "Finished"),
  );
}

function loadBooks(): Book[] {
  try {
    const stored = window.localStorage.getItem(BOOKS_STORAGE_KEY);
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (isBookList(parsed)) return parsed;
    }
  } catch {
    // Storage may be unavailable or contain malformed data; use the seed list.
  }
  return BOOKS;
}

export function App() {
  const [books, setBooks] = useState<Book[]>(loadBooks);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [shelfSort, setShelfSort] = useState<ShelfSort>("collection");
  const [editingBookId, setEditingBookId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Omit<Book, "id"> | null>(null);
  const editTitleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(books));
    } catch {
      // Keep the in-memory reading list usable when storage is unavailable or full.
    }
  }, [books]);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredBooks = books.filter((book) => {
    const matchesStatus = statusFilter === "All" || book.status === statusFilter;
    const matchesSearch = normalizedQuery.length === 0 ||
      book.title.toLocaleLowerCase().includes(normalizedQuery) ||
      book.author.toLocaleLowerCase().includes(normalizedQuery);
    return matchesStatus && matchesSearch;
  });
  const visibleBooks = shelfSort === "collection"
    ? filteredBooks
    : filteredBooks
      .map((book, collectionIndex) => ({ book, collectionIndex }))
      .sort((left, right) => {
        const primaryField = shelfSort;
        const secondaryField = shelfSort === "title" ? "author" : "title";
        const primaryOrder = left.book[primaryField].localeCompare(
          right.book[primaryField], undefined, { sensitivity: "base" },
        );
        const secondaryOrder = left.book[secondaryField].localeCompare(
          right.book[secondaryField], undefined, { sensitivity: "base" },
        );
        return primaryOrder || secondaryOrder || left.collectionIndex - right.collectionIndex;
      })
      .map(({ book }) => book);
  const hasActiveFilter = statusFilter !== "All" || normalizedQuery.length > 0;
  const titleInput = useRef<HTMLInputElement>(null);

  function handleRemove(id: number) {
    setBooks((currentBooks) => currentBooks.filter((book) => book.id !== id));
    if (editingBookId === id) {
      setEditingBookId(null);
      setEditDraft(null);
    }
  }

  function handleEdit(id: number) {
    const book = books.find((item) => item.id === id);
    if (!book) return;
    setEditingBookId(id);
    setEditDraft({ title: book.title, author: book.author, status: book.status });
    requestAnimationFrame(() => editTitleInput.current?.focus());
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    if (!editDraft) return;
    const title = editDraft.title.trim();
    const author = editDraft.author.trim();
    if (!title || !author) return;

    setBooks((currentBooks) => currentBooks.map((book) =>
      book.id === id ? { ...book, title, author, status: editDraft.status } : book,
    ));
    setEditingBookId(null);
    setEditDraft(null);
  }

  function handleCancelEdit() {
    setEditingBookId(null);
    setEditDraft(null);
  }

  function handleFinish(id: number) {
    setBooks((currentBooks) =>
      currentBooks.map((book) => (book.id === id ? { ...book, status: "Finished" } : book)),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const author = String(data.get("author") ?? "").trim();

    if (!title || !author) {
      return;
    }

    const id = Math.max(0, ...books.map((book) => book.id)) + 1;
    setBooks([...books, { id, title, author, status: "Up next" }]);
    form.reset();
    titleInput.current?.focus();
  }

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Pocket Library</p>
        <h1>Your reading list</h1>
        <p className="subtitle">Keep a small, intentional queue of books worth your attention.</p>
      </header>

      <section className="library" aria-labelledby="library-title">
        <div className="section-heading">
          <h2 id="library-title">On your shelf</h2>
          <div className="shelf-controls">
            <label htmlFor="shelf-search">Search shelf</label>
            <input
              id="shelf-search"
              type="search"
              placeholder="Title or author"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <label htmlFor="status-filter">Filter by status</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="All">All</option>
              <option value="Reading">Reading</option>
              <option value="Up next">Up next</option>
              <option value="Finished">Finished</option>
            </select>
            <label htmlFor="shelf-sort">Sort by</label>
            <select
              id="shelf-sort"
              value={shelfSort}
              onChange={(event) => setShelfSort(event.target.value as ShelfSort)}
            >
              <option value="collection">Collection order</option>
              <option value="title">Title</option>
              <option value="author">Author</option>
            </select>
            <span>{hasActiveFilter ? `${visibleBooks.length} of ${books.length} books` : `${books.length} books`}</span>
          </div>
        </div>
        <form className="book-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="book-title">Title</label>
            <input ref={titleInput} id="book-title" name="title" required />
          </div>
          <div className="form-field">
            <label htmlFor="book-author">Author</label>
            <input id="book-author" name="author" required />
          </div>
          <button type="submit">Add book</button>
        </form>
        <ul className="book-list">
          {visibleBooks.length === 0 ? (
            <li className="empty-state" role="status">
              {books.length === 0
                ? "Your reading list is empty."
                : normalizedQuery.length > 0
                  ? "No books match your search and selected status."
                  : `No books have the status “${statusFilter}”.`}
            </li>
          ) : visibleBooks.map((book) => (
            <li className="book" key={book.id}>
              {editingBookId === book.id && editDraft ? (
                <form className="edit-form" onSubmit={(event) => handleEditSubmit(event, book.id)}>
                  <div className="form-field">
                    <label htmlFor={`edit-title-${book.id}`}>Title</label>
                    <input ref={editTitleInput} id={`edit-title-${book.id}`} required value={editDraft.title}
                      onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`edit-author-${book.id}`}>Author</label>
                    <input id={`edit-author-${book.id}`} required value={editDraft.author}
                      onChange={(event) => setEditDraft({ ...editDraft, author: event.target.value })} />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`edit-status-${book.id}`}>Reading status</label>
                    <select id={`edit-status-${book.id}`} value={editDraft.status}
                      onChange={(event) => setEditDraft({ ...editDraft, status: event.target.value as Book["status"] })}>
                      <option>Reading</option><option>Up next</option><option>Finished</option>
                    </select>
                  </div>
                  <div className="book-actions edit-actions">
                    <button className="save-button" type="submit">Save</button>
                    <button className="cancel-button" type="button" onClick={handleCancelEdit}>Cancel</button>
                    <button className="remove-button" type="button" aria-label={`Remove ${book.title} from reading list`}
                      onClick={() => handleRemove(book.id)}>Remove</button>
                  </div>
                </form>
              ) : <>
              <div>
                <h3>{book.title}</h3>
                <p>{book.author}</p>
              </div>
              <div className="book-actions">
                <button className="edit-button" type="button" onClick={() => handleEdit(book.id)}>Edit</button>
                {book.status === "Finished" ? (
                  <span className="finished-indicator">Finished</span>
                ) : (
                  <button className="finish-button" type="button" onClick={() => handleFinish(book.id)}>
                    Mark finished
                  </button>
                )}
                <button
                  className="remove-button"
                  type="button"
                  aria-label={`Remove ${book.title} from reading list`}
                  onClick={() => handleRemove(book.id)}
                >
                  Remove
                </button>
              </div>
              </>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
