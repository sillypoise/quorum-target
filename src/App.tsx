import { useEffect, useRef, useState, type FormEvent } from "react";
import { isRating, loadBooks, parseTags, saveBooks, type Book } from "./bookStorage";
import { Shelf } from "./Shelf";

type StatusFilter = "All" | Book["status"];
type ShelfSort = "collection" | "title" | "author";

export function App() {
  const [books, setBooks] = useState<Book[]>(loadBooks);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [shelfSort, setShelfSort] = useState<ShelfSort>("collection");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [editingBookId, setEditingBookId] = useState<number | null>(null);
  type EditDraft = Omit<Book, "id" | "tags" | "favourite"> & { tags: string };
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const editTitleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveBooks(books);
  }, [books]);
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
    setEditDraft({ title: book.title, author: book.author, status: book.status, note: book.note, tags: book.tags.join(", "), rating: book.rating });
    requestAnimationFrame(() => editTitleInput.current?.focus());
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    if (!editDraft) return;
    const title = editDraft.title.trim();
    const author = editDraft.author.trim();
    const note = editDraft.note.trim();
    const tags = parseTags(editDraft.tags);
    if (!title || !author) return;

    setBooks((currentBooks) => currentBooks.map((book) =>
      book.id === id ? { ...book, title, author, status: editDraft.status, note, tags, rating: editDraft.rating } : book,
    ));
    setEditingBookId(null);
    setEditDraft(null);
  }

  function handleCancelEdit() {
    setEditingBookId(null);
    setEditDraft(null);
  }

  function handleToggleFavourite(id: number) {
    setBooks((currentBooks) => currentBooks.map((book) =>
      book.id === id ? { ...book, favourite: !book.favourite } : book,
    ));
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
    const note = String(data.get("note") ?? "").trim();
    const tags = parseTags(String(data.get("tags") ?? ""));
    const ratingValue = String(data.get("rating") ?? "");
    const rating = ratingValue === "" ? null : Number(ratingValue);
    if (rating !== null && !isRating(rating)) return;

    if (!title || !author) {
      return;
    }

    const id = Math.max(0, ...books.map((book) => book.id)) + 1;
    setBooks([...books, { id, title, author, status: "Up next", note, tags, rating, favourite: false }]);
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

      <form className="book-form" onSubmit={handleSubmit}>
          <div className="form-field"><label htmlFor="book-title">Title</label><input ref={titleInput} id="book-title" name="title" required /></div>
          <div className="form-field"><label htmlFor="book-author">Author</label><input id="book-author" name="author" required /></div>
          <div className="form-field"><label htmlFor="book-tags">Tags (optional)</label><input id="book-tags" name="tags" placeholder="Comma-separated tags" /></div>
          <div className="form-field"><label htmlFor="book-rating">Rating (optional)</label><select id="book-rating" name="rating" defaultValue=""><option value="">Unrated</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} star{rating === 1 ? "" : "s"}</option>)}</select></div>
          <div className="form-field note-field"><label htmlFor="book-note">Note (optional)</label><textarea id="book-note" name="note" rows={2} /></div>
          <button type="submit">Add book</button>
        </form>
      <Shelf books={books} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
        searchQuery={searchQuery} onSearchQueryChange={setSearchQuery} shelfSort={shelfSort}
        onShelfSortChange={setShelfSort} favouritesOnly={favouritesOnly} onFavouritesOnlyChange={setFavouritesOnly}
        editingBookId={editingBookId} editDraft={editDraft}
        editTitleInput={editTitleInput} onEditDraftChange={setEditDraft} onEditSubmit={handleEditSubmit}
        onCancelEdit={handleCancelEdit} onRemove={handleRemove} onEdit={handleEdit} onFinish={handleFinish} onToggleFavourite={handleToggleFavourite} />
    </main>
  );
}
