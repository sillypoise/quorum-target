import { useState, type FormEvent } from "react";
import { Cover } from "./Cover.tsx";
import { DueDateForm } from "./DueDateForm.tsx";
import { useBookSearch } from "./useBookSearch.ts";
import {
  addBookToOpen,
  bookErrors,
  browserStorage,
  collectionNameError,
  dueDateError,
  dueStatus,
  hasBook,
  loadLibrary,
  saveLibrary,
  todayString,
  type Book,
  type DueStatus,
  type Library,
} from "./library.ts";

const bookCount = (count: number) => `${count} ${count === 1 ? "book" : "books"}`;

function badgeText(status: DueStatus, days: number) {
  const unit = `${days} ${days === 1 ? "day" : "days"}`;
  if (status === "upcoming") return `Due in ${unit}`;
  if (status === "approaching") return `Due soon: in ${unit}`;
  if (status === "due-today") return "Due today";
  return `Overdue by ${unit}`;
}

function DueBadge({ book, today }: { book: Book; today: string }) {
  const { status, days } = dueStatus(book, today);
  if (status === "none") return null;
  return <span className={`badge ${status}`}>{badgeText(status, days)}</span>;
}

// today is injectable so tests control the date; it defaults to the browser's local date.
export function App({ today = todayString() }: { today?: string }) {
  const [library, setLibrary] = useState<Library>(() => loadLibrary(browserStorage()));
  const [showAuthors, setShowAuthors] = useState(true);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [authorError, setAuthorError] = useState<string | null>(null);
  const [dueInput, setDueInput] = useState("");
  const [dueError, setDueError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const found = useBookSearch();
  const [saveError, setSaveError] = useState<string | null>(null);

  const collection = library.collections[library.open];
  // Keep each book's position so removal targets the right entry when titles repeat.
  const sortedBooks = collection.books
    .map((book, index) => ({ book, index }))
    .sort((a, b) => (a.book.title < b.book.title ? -1 : a.book.title > b.book.title ? 1 : 0));

  function commit(next: Library) {
    setLibrary(next);
    setSaveError(
      saveLibrary(browserStorage(), next)
        ? null
        : "Changes could not be saved in this browser and will be lost on reload. Free up browser storage, then try again.",
    );
  }

  function openCollection(index: number) {
    commit({ ...library, open: index });
  }

  function createCollection(event: FormEvent) {
    event.preventDefault();
    const error = collectionNameError(newName, library.collections);
    setNameError(error);
    if (error) return;
    commit({
      collections: [...library.collections, { name: newName.trim(), books: [] }],
      open: library.collections.length,
    });
    setNewName("");
  }

  function addBook(event: FormEvent) {
    event.preventDefault();
    const errors = bookErrors({ title, author });
    setTitleError(errors.title);
    setAuthorError(errors.author);
    const dateError = dueDateError(dueInput);
    setDueError(dateError);
    if (errors.title || errors.author || dateError) return;
    const book: Book = { title: title.trim(), author: author.trim() };
    if (dueInput.trim() !== "") book.dueDate = dueInput.trim();
    commit(addBookToOpen(library, book));
    setTitle("");
    setAuthor("");
    setDueInput("");
  }

  function runSearch(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "") {
      setQueryError("Enter a title or author to search for.");
      return;
    }
    setQueryError(null);
    found.search(trimmed);
  }

  function changeBook(bookIndex: number, change: (book: Book) => Book) {
    const collections = library.collections.map((item, index) =>
      index === library.open
        ? { ...item, books: item.books.map((book, i) => (i === bookIndex ? change(book) : book)) }
        : item,
    );
    commit({ ...library, collections });
  }

  // Unread removes the field, so a never-read book and a read-then-unread book store identically.
  function toggleRead(bookIndex: number) {
    changeBook(bookIndex, ({ read, ...rest }) => (read ? rest : { ...rest, read: true }));
  }

  function setDueDate(bookIndex: number, dueDate: string | null) {
    changeBook(bookIndex, ({ dueDate: _old, ...rest }) =>
      dueDate === null ? rest : { ...rest, dueDate },
    );
  }

  function removeBook(bookIndex: number) {
    const collections = library.collections.map((item, index) =>
      index === library.open
        ? { ...item, books: item.books.filter((_, i) => i !== bookIndex) }
        : item,
    );
    commit({ ...library, collections });
  }

  return (
    <main>
      <h1>Pocket Library</h1>
      <p>A tiny reading list.</p>
      {saveError && <p role="alert" className="error">Error: {saveError}</p>}
      <nav aria-label="Collections">
        <ul className="collections">
          {library.collections.map((item, index) => (
            <li key={item.name}>
              <button
                type="button"
                aria-current={index === library.open ? "true" : undefined}
                onClick={() => openCollection(index)}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={createCollection} noValidate>
          <label htmlFor="new-collection">New collection name</label>
          <input
            id="new-collection"
            value={newName}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "new-collection-error" : undefined}
            onChange={(event) => setNewName(event.target.value)}
          />
          <button type="submit">Create collection</button>
          {nameError && (
            <p id="new-collection-error" role="alert" className="error">Error: {nameError}</p>
          )}
        </form>
      </nav>
      <section aria-labelledby="reading-list-title">
        <h2 id="reading-list-title">
          {collection.name} ({bookCount(collection.books.length)})
        </h2>
        <label>
          <input
            type="checkbox"
            checked={showAuthors}
            onChange={(event) => setShowAuthors(event.target.checked)}
          />
          Show authors
        </label>
        {sortedBooks.length === 0 && (
          <p>No books in this collection yet. Add one with the form below.</p>
        )}
        <ul>
          {sortedBooks.map(({ book, index }) => (
            <li key={index}>
              <Cover id={book.cover} />
              <h3>{book.title}</h3>
              {showAuthors && <p>{book.author}</p>}
              <button type="button" aria-label={`Remove ${book.title}`} onClick={() => removeBook(index)}>
                Remove
              </button>
              <div className="book-extra">
                {book.read ? (
                  <span className="badge read">Read</span>
                ) : (
                  <DueBadge book={book} today={today} />
                )}
                <button
                  type="button"
                  aria-label={`${book.read ? "Mark unread" : "Mark read"}: ${book.title}`}
                  onClick={() => toggleRead(index)}
                >
                  {book.read ? "Mark unread" : "Mark read"}
                </button>
                {!book.read && (
                  <DueDateForm
                    key={`${index}|${book.title}|${book.author}|${book.dueDate ?? ""}`}
                    id={`due-${index}`}
                    title={book.title}
                    dueDate={book.dueDate}
                    onSave={(date) => setDueDate(index, date)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={runSearch} noValidate aria-label="Find a book">
          <label htmlFor="book-search">Find a book on Open Library</label>
          <input
            id="book-search"
            value={query}
            aria-invalid={queryError ? true : undefined}
            aria-describedby={queryError ? "book-search-error" : undefined}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit">Search</button>
          {queryError && (
            <p id="book-search-error" role="alert" className="error">Error: {queryError}</p>
          )}
        </form>
        {found.status === "loading" && <p role="status">Searching…</p>}
        {found.status === "failed" && <p role="alert" className="error">Error: {found.error}</p>}
        {found.status === "done" && found.books.length === 0 && (
          <p role="status">No books found. Try a different title or author, or add the book below.</p>
        )}
        {found.books.length > 0 && (
          <ul aria-label="Search results">
            {found.books.map((book, index) => {
              const added = hasBook(collection, book);
              return (
                <li key={index}>
                  <Cover id={book.cover} />
                  <h3>{book.title}</h3>
                  <p>{book.author}</p>
                  <button
                    type="button"
                    disabled={added}
                    aria-label={`${added ? "Already added" : "Add"} ${book.title}`}
                    onClick={() => commit(addBookToOpen(library, book))}
                  >
                    {added ? "Already added" : "Add"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={addBook} noValidate aria-label={`Add a book to ${collection.name}`}>
          <label htmlFor="book-title">Title</label>
          <input
            id="book-title"
            value={title}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? "book-title-error" : undefined}
            onChange={(event) => setTitle(event.target.value)}
          />
          {titleError && <p id="book-title-error" role="alert" className="error">Error: {titleError}</p>}
          <label htmlFor="book-author">Author</label>
          <input
            id="book-author"
            value={author}
            aria-invalid={authorError ? true : undefined}
            aria-describedby={authorError ? "book-author-error" : undefined}
            onChange={(event) => setAuthor(event.target.value)}
          />
          {authorError && <p id="book-author-error" role="alert" className="error">Error: {authorError}</p>}
          <label htmlFor="book-due">Due date (optional)</label>
          <input
            id="book-due"
            type="date"
            value={dueInput}
            aria-invalid={dueError ? true : undefined}
            aria-describedby={dueError ? "book-due-error" : undefined}
            onChange={(event) => setDueInput(event.target.value)}
          />
          {dueError && <p id="book-due-error" role="alert" className="error">Error: {dueError}</p>}
          <button type="submit">Add book</button>
        </form>
      </section>
    </main>
  );
}
