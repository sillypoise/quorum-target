import { useState } from "react";

const books = [
  { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin" },
  { title: "The Dispossessed", author: "Ursula K. Le Guin" },
  { title: "Kindred", author: "Octavia E. Butler" },
];

export function App() {
  const [showAuthors, setShowAuthors] = useState(true);
  const sortedBooks = [...books].sort((a, b) =>
    a.title < b.title ? -1 : a.title > b.title ? 1 : 0,
  );

  return (
    <main>
      <h1>Pocket Library ({books.length} books)</h1>
      <p>A tiny reading list.</p>
      <section aria-labelledby="reading-list-title">
        <h2 id="reading-list-title">Books to read</h2>
        <label>
          <input
            type="checkbox"
            checked={showAuthors}
            onChange={(event) => setShowAuthors(event.target.checked)}
          />
          Show authors
        </label>
        <ul>
          {sortedBooks.map((book) => (
            <li key={book.title}>
              <h3>{book.title}</h3>
              {showAuthors && <p>{book.author}</p>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
