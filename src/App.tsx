import { useEffect, useRef, useState, type FormEvent } from "react";

interface Book {
  id: number;
  title: string;
  author: string;
  status: "Reading" | "Up next" | "Finished";
}

type StatusFilter = "All" | Book["status"];

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

  useEffect(() => {
    try {
      window.localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(books));
    } catch {
      // Keep the in-memory reading list usable when storage is unavailable or full.
    }
  }, [books]);
  const visibleBooks = statusFilter === "All"
    ? books
    : books.filter((book) => book.status === statusFilter);
  const titleInput = useRef<HTMLInputElement>(null);

  function handleRemove(id: number) {
    setBooks((currentBooks) => currentBooks.filter((book) => book.id !== id));
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
            <span>{statusFilter === "All" ? `${books.length} books` : `${visibleBooks.length} of ${books.length} books`}</span>
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
              {statusFilter === "All" ? "Your reading list is empty." : `No books have the status “${statusFilter}”.`}
            </li>
          ) : visibleBooks.map((book) => (
            <li className="book" key={book.id}>
              <div>
                <h3>{book.title}</h3>
                <p>{book.author}</p>
              </div>
              <div className="book-actions">
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
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
