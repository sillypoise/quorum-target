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
          <span>{BOOKS.length} books</span>
        </div>
        <ul className="book-list">
          {BOOKS.map((book) => (
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
