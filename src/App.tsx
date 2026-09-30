const books = [
  { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin" },
  { title: "The Dispossessed", author: "Ursula K. Le Guin" },
  { title: "Kindred", author: "Octavia E. Butler" },
];

export function App() {
  return (
    <main>
      <h1>Pocket Library</h1>
      <p>A tiny reading list.</p>
      <section aria-labelledby="reading-list-title">
        <h2 id="reading-list-title">Books to read</h2>
        <ul>
          {books.map((book) => (
            <li key={book.title}>
              <h3>{book.title}</h3>
              <p>{book.author}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
