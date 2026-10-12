# Pocket Library — simple-app lab

A deliberately small React/TypeScript/Vite app for experimenting with procedural LLM/Jev stages.

## Behaviour

- Books are grouped into collections. A collection has a name and a list of books; a book has a
  title and an author. The first run starts with one collection, "Sci-fi", holding three books.
- One collection is shown at a time, books sorted by title. You can create a collection, switch
  between collections, add a book (title and author) and remove a book.
- Empty names, titles and authors, and collection names that duplicate an existing one (ignoring
  case and surrounding spaces), are rejected with a message next to the field.
- "Show authors" applies to whichever collection is open. Its state is not saved.
- Everything is saved in the browser's `localStorage` (key `pocket-library`) as soon as it
  changes, including which collection is open. No backend, account or sync.
- "Find a book" searches Open Library (`openlibrary.org/search.json`, called from the browser, no
  key or backend) on submit and lists up to 10 results with title, author and a small cover. "Add"
  puts the result in the open collection and saves it. A result already in the open collection
  (same title and author, ignoring case and spaces) shows "Already added" with a disabled button;
  manual add still allows duplicates. An empty query, loading, no results and failures (network,
  bad status, unreadable reply, 8-second timeout) are shown as text. A new search aborts the
  previous one and only the latest may show results; leaving the page aborts the current one.
- A book may carry an optional Open Library cover id, shown as a thumbnail in the list and the
  results. A cover that fails to load is hidden until the page is reloaded. Books without one show
  no image. Missing covers are requested with `default=false` so Open Library answers 404 rather
  than a placeholder image.
- Each book may have a due date (`YYYY-MM-DD`, no time or timezone), set in the Add form (optional)
  or per book with a date field and "Set due date" button; "Clear due date" removes it. An empty
  per-book submit shows an error and changes nothing. Past dates are accepted and show as overdue.
  An unread book with a date shows a text badge: "Due in N days", "Due soon: in N days" (14 days
  or fewer), "Due today" or "Overdue by N days". "Mark read" / "Mark unread" toggles a book; a read
  book shows "Read" and hides its date and badge, and unread brings the same date back. "Today" is
  the browser's local date, read when the page renders; badges do not update while the page sits open.
- Stored data is `{ "version": 1, "open": <index>, "collections": [{ "name", "books": [{ "title", "author", "cover"?, "dueDate"?, "read"? }] }] }`,
  where `cover` is a positive integer, `dueDate` a real calendar date and `read` is only ever `true`
  (unread removes it). An invalid `cover`, `dueDate` or `read` is dropped from that book, not the library. Version 1
  data written before covers existed loads unchanged.
  Missing, unreadable, invalid or other-version data is ignored and the seed is shown; it is only
  overwritten when the next change is saved. There is no migration yet: a later format must bump
  `version` and convert or discard version 1.
- If a save fails (for example, storage is full or blocked), the change stays on screen and an
  error says it will be lost on reload.

## Not covered

Renaming or deleting collections (a mistyped collection name is currently permanent), editing or
moving books, sorting or filtering by due date, reminders, editing titles or authors, pagination or search-as-you-type, result caching, large covers or a book detail
view, ISBN lookup, filters, import/export, routing, any backend, and migration of older data.

## Layout

`src/library.ts` holds the data types, seed, storage reading, validation and writing (no React).
`src/openlibrary.ts` is the Open Library search and cover URL (no React); `src/useBookSearch.ts`
is the hook that owns the request lifecycle; `src/Cover.tsx` renders a cover image; `src/DueDateForm.tsx` is the per-book due date form.
`src/App.tsx` renders it, `src/main.tsx` mounts it, `src/styles.css` styles it.

## Commands

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

The tests never use the network: `fetch` is faked. They cover the storage module directly (seeding, round trip, corrupt, missing and wrong-version
data, throwing storage, validation) and drive the actual component in jsdom over an in-memory
storage (create, switch, add, remove, rejected input, reload, failed save, Show authors, search, add, overlapping searches, covers, due dates, badges, read toggle). Browser
layout, navigation, and deployment behavior are not established by these checks.

This baseline does not yet run the new procedural chain.
