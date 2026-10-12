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
- Stored data is `{ "version": 1, "open": <index>, "collections": [{ "name", "books": [{ "title", "author" }] }] }`.
  Missing, unreadable, invalid or other-version data is ignored and the seed is shown; it is only
  overwritten when the next change is saved. There is no migration yet: a later format must bump
  `version` and convert or discard version 1.
- If a save fails (for example, storage is full or blocked), the change stays on screen and an
  error says it will be lost on reload.

## Not covered

Renaming or deleting collections (a mistyped collection name is currently permanent), editing or
moving books, search, filters, import/export, routing, any backend, and migration of older data.

## Layout

`src/library.ts` holds the data types, seed, storage reading, validation and writing (no React).
`src/App.tsx` renders it, `src/main.tsx` mounts it, `src/styles.css` styles it.

## Commands

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

The tests cover the storage module directly (seeding, round trip, corrupt, missing and wrong-version
data, throwing storage, validation) and drive the actual component in jsdom over an in-memory
storage (create, switch, add, remove, rejected input, reload, failed save, Show authors). Browser
layout, navigation, and deployment behavior are not established by these checks.

This baseline does not yet run the new procedural chain.
