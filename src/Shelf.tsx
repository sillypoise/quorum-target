import type { Book } from "./bookStorage";

type StatusFilter = "All" | Book["status"];
type ShelfSort = "collection" | "title" | "author";

type Props = {
  books: Book[];
  tagOptions: string[];
  selectedTag: string;
  onSelectedTagChange: (tag: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  shelfSort: ShelfSort;
  onShelfSortChange: (sort: ShelfSort) => void;
  favouritesOnly: boolean;
  onFavouritesOnlyChange: (enabled: boolean) => void;
  editingBookId: number | null;
  editDraft: (Omit<Book, "id" | "tags" | "favourite"> & { tags: string }) | null;
  editTitleInput: React.RefObject<HTMLInputElement | null>;
  onEditDraftChange: (draft: Omit<Book, "id" | "tags" | "favourite"> & { tags: string }) => void;
  onEditSubmit: (event: React.FormEvent<HTMLFormElement>, id: number) => void;
  onCancelEdit: () => void;
  onRemove: (id: number) => void;
  onEdit: (id: number) => void;
  onFinish: (id: number) => void;
  onToggleFavourite: (id: number) => void;
};

export function Shelf(props: Props) {
  const { books, tagOptions, selectedTag, onSelectedTagChange, statusFilter, onStatusFilterChange, searchQuery, onSearchQueryChange,
    shelfSort, onShelfSortChange, favouritesOnly, onFavouritesOnlyChange, editingBookId, editDraft, editTitleInput,
    onEditDraftChange, onEditSubmit, onCancelEdit, onRemove, onEdit, onFinish, onToggleFavourite } = props;
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredBooks = books.filter((book) => {
    const matchesStatus = statusFilter === "All" || book.status === statusFilter;
    const matchesFavourite = !favouritesOnly || book.favourite;
    const matchesTag = selectedTag === "" || book.tags.includes(selectedTag);
    const matchesSearch = normalizedQuery.length === 0 ||
      book.title.toLocaleLowerCase().includes(normalizedQuery) ||
      book.author.toLocaleLowerCase().includes(normalizedQuery);
    return matchesStatus && matchesSearch && matchesFavourite && matchesTag;
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
  const hasActiveFilter = statusFilter !== "All" || normalizedQuery.length > 0 || favouritesOnly || selectedTag !== "";

  return (
    <section className="library" aria-labelledby="library-title">
      <div className="section-heading">
        <h2 id="library-title">On your shelf</h2>
        <div className="shelf-controls">
          <label htmlFor="shelf-search">Search shelf</label>
          <input id="shelf-search" type="search" placeholder="Title or author" value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)} />
          <label htmlFor="favourites-only">Favourites only</label>
          <input id="favourites-only" className="favourites-checkbox" type="checkbox" checked={favouritesOnly}
            onChange={(event) => onFavouritesOnlyChange(event.target.checked)} />
          <label htmlFor="tag-filter">Filter by tag</label>
          <select id="tag-filter" value={selectedTag} onChange={(event) => onSelectedTagChange(event.target.value)}>
            <option value="">All tags</option>{tagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
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
            {books.length === 0 ? "Your reading list is empty." : selectedTag !== ""
              ? "No books match your selected filters."
              : favouritesOnly
              ? normalizedQuery.length > 0 || statusFilter !== "All"
                ? "No favourite books match your search and selected status."
                : "You have no favourite books."
              : normalizedQuery.length > 0
                ? "No books match your search and selected status."
                : `No books have the status “${statusFilter}”.`}
          </li>
        ) : visibleBooks.map((book) => (
          <li className="book" key={book.id}>
            {editingBookId === book.id && editDraft ? (
              <form className="edit-form" onSubmit={(event) => onEditSubmit(event, book.id)}>
                <button className={`favourite-button${book.favourite ? " is-favourite" : ""}`} type="button"
                  aria-label={`${book.favourite ? "Remove" : "Add"} ${book.title} ${book.favourite ? "from" : "to"} favourites`}
                  aria-pressed={book.favourite} onClick={() => onToggleFavourite(book.id)}>
                  {book.favourite ? "★ Favourite" : "☆ Favourite"}
                </button>
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
                <div className="form-field"><label htmlFor={`edit-rating-${book.id}`}>Rating (optional)</label>
                  <select id={`edit-rating-${book.id}`} value={editDraft.rating ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      onEditDraftChange({ ...editDraft, rating: value === "" ? null : Number(value) as Exclude<Book["rating"], null> });
                    }}>
                    <option value="">Unrated</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} star{rating === 1 ? "" : "s"}</option>)}
                  </select></div>
                <div className="form-field"><label htmlFor={`edit-tags-${book.id}`}>Tags (optional)</label>
                  <input id={`edit-tags-${book.id}`} placeholder="Comma-separated tags" value={editDraft.tags}
                    onChange={(event) => onEditDraftChange({ ...editDraft, tags: event.target.value })} /></div>
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
                <p className={book.rating === null ? "shelf-rating unrated" : "shelf-rating"}>
                  {book.rating === null ? "Unrated" : <span aria-label={`${book.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }, (_, index) => <span key={index} aria-hidden="true">{index < book.rating! ? "★" : "☆"}</span>)}
                  </span>}
                </p>
                {book.note.length > 0 && <p className="book-note">{book.note}</p>}
                {book.tags.length > 0 && <ul className="book-tags" aria-label="Tags">
                  {book.tags.map((tag, index) => <li key={`${index}-${tag}`}>{tag}</li>)}
                </ul>}</div>
              <div className="book-actions">
                <button className={`favourite-button${book.favourite ? " is-favourite" : ""}`} type="button"
                  aria-label={`${book.favourite ? "Remove" : "Add"} ${book.title} ${book.favourite ? "from" : "to"} favourites`}
                  aria-pressed={book.favourite} onClick={() => onToggleFavourite(book.id)}>
                  {book.favourite ? "★ Favourite" : "☆ Favourite"}
                </button>
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
