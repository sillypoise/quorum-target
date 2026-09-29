import type { Book } from "./bookStorage";

type StatusFilter = "All" | Book["status"];
type ShelfSort = "collection" | "title" | "author";

type Props = {
  books: Book[];
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  shelfSort: ShelfSort;
  onShelfSortChange: (sort: ShelfSort) => void;
  editingBookId: number | null;
  editDraft: Omit<Book, "id"> | null;
  editTitleInput: React.RefObject<HTMLInputElement | null>;
  onEditDraftChange: (draft: Omit<Book, "id">) => void;
  onEditSubmit: (event: React.FormEvent<HTMLFormElement>, id: number) => void;
  onCancelEdit: () => void;
  onRemove: (id: number) => void;
  onEdit: (id: number) => void;
  onFinish: (id: number) => void;
};

export function Shelf(props: Props) {
  const { books, statusFilter, onStatusFilterChange, searchQuery, onSearchQueryChange,
    shelfSort, onShelfSortChange, editingBookId, editDraft, editTitleInput,
    onEditDraftChange, onEditSubmit, onCancelEdit, onRemove, onEdit, onFinish } = props;
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredBooks = books.filter((book) => {
    const matchesStatus = statusFilter === "All" || book.status === statusFilter;
    const matchesSearch = normalizedQuery.length === 0 ||
      book.title.toLocaleLowerCase().includes(normalizedQuery) ||
      book.author.toLocaleLowerCase().includes(normalizedQuery);
    return matchesStatus && matchesSearch;
  });
  const visibleBooks = shelfSort === "collection" ? filteredBooks : filteredBooks
    .map((book, collectionIndex) => ({ book, collectionIndex }))
    .sort((left, right) => {
      const primaryField = shelfSort;
      const secondaryField = shelfSort === "title" ? "author" : "title";
      const primaryOrder = left.book[primaryField].localeCompare(right.book[primaryField], undefined, { sensitivity: "base" });
      const secondaryOrder = left.book[secondaryField].localeCompare(right.book[secondaryField], undefined, { sensitivity: "base" });
      return primaryOrder || secondaryOrder || left.collectionIndex - right.collectionIndex;
    }).map(({ book }) => book);
  const hasActiveFilter = statusFilter !== "All" || normalizedQuery.length > 0;

  return (
    <section className="library" aria-labelledby="library-title">
      <div className="section-heading">
        <h2 id="library-title">On your shelf</h2>
        <div className="shelf-controls">
          <label htmlFor="shelf-search">Search shelf</label>
          <input id="shelf-search" type="search" placeholder="Title or author" value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)} />
          <label htmlFor="status-filter">Filter by status</label>
          <select id="status-filter" value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}>
            <option value="All">All</option><option value="Reading">Reading</option>
            <option value="Up next">Up next</option><option value="Finished">Finished</option>
          </select>
          <label htmlFor="shelf-sort">Sort by</label>
          <select id="shelf-sort" value={shelfSort}
            onChange={(event) => onShelfSortChange(event.target.value as ShelfSort)}>
            <option value="collection">Collection order</option><option value="title">Title</option><option value="author">Author</option>
          </select>
          <span>{hasActiveFilter ? `${visibleBooks.length} of ${books.length} books` : `${books.length} books`}</span>
        </div>
      </div>
      <ul className="book-list">
        {visibleBooks.length === 0 ? (
          <li className="empty-state" role="status">
            {books.length === 0 ? "Your reading list is empty." : normalizedQuery.length > 0
              ? "No books match your search and selected status."
              : `No books have the status “${statusFilter}”.`}
          </li>
        ) : visibleBooks.map((book) => (
          <li className="book" key={book.id}>
            {editingBookId === book.id && editDraft ? (
              <form className="edit-form" onSubmit={(event) => onEditSubmit(event, book.id)}>
                <div className="form-field"><label htmlFor={`edit-title-${book.id}`}>Title</label>
                  <input ref={editTitleInput} id={`edit-title-${book.id}`} required value={editDraft.title}
                    onChange={(event) => onEditDraftChange({ ...editDraft, title: event.target.value })} /></div>
                <div className="form-field"><label htmlFor={`edit-author-${book.id}`}>Author</label>
                  <input id={`edit-author-${book.id}`} required value={editDraft.author}
                    onChange={(event) => onEditDraftChange({ ...editDraft, author: event.target.value })} /></div>
                <div className="form-field"><label htmlFor={`edit-status-${book.id}`}>Reading status</label>
                  <select id={`edit-status-${book.id}`} value={editDraft.status}
                    onChange={(event) => onEditDraftChange({ ...editDraft, status: event.target.value as Book["status"] })}>
                    <option>Reading</option><option>Up next</option><option>Finished</option>
                  </select></div>
                <div className="form-field note-field"><label htmlFor={`edit-note-${book.id}`}>Note (optional)</label>
                  <textarea id={`edit-note-${book.id}`} rows={2} value={editDraft.note}
                    onChange={(event) => onEditDraftChange({ ...editDraft, note: event.target.value })} /></div>
                <div className="book-actions edit-actions">
                  <button className="save-button" type="submit">Save</button>
                  <button className="cancel-button" type="button" onClick={onCancelEdit}>Cancel</button>
                  <button className="remove-button" type="button" aria-label={`Remove ${book.title} from reading list`}
                    onClick={() => onRemove(book.id)}>Remove</button>
                </div>
              </form>
            ) : <>
              <div><h3>{book.title}</h3><p>{book.author}</p>
                {book.note.length > 0 && <p className="book-note">{book.note}</p>}</div>
              <div className="book-actions">
                <button className="edit-button" type="button" onClick={() => onEdit(book.id)}>Edit</button>
                {book.status === "Finished" ? <span className="finished-indicator">Finished</span> :
                  <button className="finish-button" type="button" onClick={() => onFinish(book.id)}>Mark finished</button>}
                <button className="remove-button" type="button" aria-label={`Remove ${book.title} from reading list`}
                  onClick={() => onRemove(book.id)}>Remove</button>
              </div>
            </>}
          </li>
        ))}
      </ul>
    </section>
  );
}
