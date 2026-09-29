import { useRef, useState, type FormEvent } from "react";

interface Book {
  id: number;
  title: string;
  author: string;
  status: "Reading" | "Up next";
}

const BOOKS: Book[] = [
  { id: 1, title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", status: "Reading" },
  { id: 2, title: "The Dispossessed", author: "Ursula K. Le Guin", status: "Up next" },
  { id: 3, title: "Kindred", author: "Octavia E. Butler", status: "Up next" },
];

export function App() {
  const [books, setBooks] = useState(BOOKS);
  const titleInput = useRef<HTMLInputElement>(null);

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
          <span>{books.length} books</span>
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
          {books.map((book) => (
            <li className="book" key={book.id}>
              <div>
                <h3>{book.title}</h3>
                <p>{book.author}</p>
              </div>
              <span className={`status status-${book.status === "Reading" ? "active" : "next"}`}>
                {book.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
