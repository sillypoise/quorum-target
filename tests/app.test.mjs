import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { mock } from "node:test";
import { runInThisContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { act, createElement } from "react";
import { JSDOM } from "jsdom";
import ts from "typescript";

// react-dom/client checks for a DOM when it loads (it decides whether "input" events work),
// so it is loaded once while a throwaway window exists.
const bootstrap = new JSDOM("");
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import("react-dom/client");
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();

// App.tsx imports ./library.ts, so each source file is compiled and the import is resolved by name.
const nodeRequire = createRequire(import.meta.url);
const cache = new Map();
function loadSource(file) {
  if (cache.has(file)) return cache.get(file);
  const text = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => (name.startsWith("./") ? loadSource(name.slice(2)) : nodeRequire(name));
  runInThisContext(`(function(require,module,exports){${compiled}\n})`)(
    localRequire,
    module,
    module.exports,
  );
  cache.set(file, module.exports);
  return module.exports;
}
const { App } = loadSource("App.tsx");
const lib = loadSource("library.ts");
const ol = loadSource("openlibrary.ts");

const SEED_TITLES = ["Kindred", "The Dispossessed", "The Left Hand of Darkness"];

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    writes: 0,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem(key, value) {
      this.writes += 1;
      data.set(key, String(value));
    },
    removeItem: (key) => data.delete(key),
  };
}

const stored = (version, collections, open = 0) => JSON.stringify({ version, open, collections });
const col = (name, ...titles) => ({
  name,
  books: titles.map((title) => ({ title, author: `${title} author` })),
});

// Mounts a fresh App in jsdom over the given storage; `reload` mounts a new App over the same storage.
async function withPage(storage, run, fetchFn = async () => { throw new Error("unexpected fetch"); }) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test" });
  const globals = ["window", "document", "localStorage", "fetch", "IS_REACT_ACT_ENVIRONMENT"];
  const descriptors = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  let root;
  const container = dom.window.document.getElementById("root");
  const page = {
    today: "2025-06-15",
    container,
    text: () => container.textContent,
    titles: () => [...container.querySelectorAll("li h3")].map((node) => node.textContent),
    h2: () => container.querySelector("h2").textContent,
    alerts: () => [...container.querySelectorAll('[role="alert"]')].map((node) => node.textContent),
    button: (name) =>
      [...container.querySelectorAll("button")].find(
        (node) => node.textContent === name || node.getAttribute("aria-label") === name,
      ),
    click: (name) => {
      const target = page.button(name);
      assert(target, `no button named ${name}`);
      return act(() => target.click());
    },
    type: (label, value) => {
      const input = container.querySelector(`#${[...container.querySelectorAll("label")].find((l) => l.textContent === label).htmlFor}`);
      return act(() => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    },
    submit: (name) => page.click(name),
    unmount: async () => {
      await act(() => root.unmount());
      root = null;
    },
    mount: async () => {
      if (root) await act(() => root.unmount());
      root = createRoot(container);
      await act(() => root.render(createElement(App, { today: page.today })));
    },
  };
  try {
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = storage;
    globalThis.fetch = fetchFn;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    await page.mount();
    await run(page);
  } finally {
    if (root) await act(() => root.unmount());
    dom.window.close();
    globals.forEach((key, index) => {
      if (descriptors[index]) Object.defineProperty(globalThis, key, descriptors[index]);
      else delete globalThis[key];
    });
  }
}

// --- storage module: no browser needed ---

test("missing storage yields the seed without writing", () => {
  const storage = memoryStorage();
  assert.deepEqual(lib.loadLibrary(storage), lib.seedLibrary());
  assert.deepEqual(lib.loadLibrary(null), lib.seedLibrary());
  assert.equal(storage.writes, 0);
  assert.equal(lib.seedLibrary().collections[0].name, "Sci-fi");
  assert.equal(lib.seedLibrary().collections[0].books.length, 3);
});

test("a saved library loads back unchanged and records the format version", () => {
  const storage = memoryStorage();
  const library = { open: 1, collections: [col("Sci-fi", "A"), col("Non-fiction", "B")] };
  assert.equal(lib.saveLibrary(storage, library), true);
  assert.equal(JSON.parse(storage.getItem(lib.STORAGE_KEY)).version, lib.STORAGE_VERSION);
  assert.deepEqual(lib.loadLibrary(storage), library);
});

const badStored = {
  "invalid JSON": "{not json",
  "a non-object": "42",
  "null": "null",
  "a wrong version": stored(2, [col("Sci-fi", "A")]),
  "a missing version": JSON.stringify({ collections: [col("Sci-fi", "A")], open: 0 }),
  "no collections list": JSON.stringify({ version: 1, open: 0 }),
  "an empty collections list": stored(1, []),
  "a collection without a name": stored(1, [{ books: [] }]),
  "a collection with a blank name": stored(1, [{ name: "  ", books: [] }]),
  "a collection without books": stored(1, [{ name: "X" }]),
  "a book without an author": stored(1, [{ name: "X", books: [{ title: "T" }] }]),
  "a book with a non-string title": stored(1, [{ name: "X", books: [{ title: 5, author: "A" }] }]),
};
for (const [label, raw] of Object.entries(badStored)) {
  test(`stored data with ${label} falls back to the seed without throwing`, () => {
    assert.deepEqual(lib.loadLibrary(memoryStorage({ [lib.STORAGE_KEY]: raw })), lib.seedLibrary());
  });
}

test("an out-of-range open collection falls back to the first collection", () => {
  const storage = memoryStorage({ [lib.STORAGE_KEY]: stored(1, [col("A"), col("B")], 7) });
  assert.equal(lib.loadLibrary(storage).open, 0);
});

test("storage that throws is tolerated on read and reported on write", () => {
  const broken = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("full"); },
  };
  assert.deepEqual(lib.loadLibrary(broken), lib.seedLibrary());
  assert.equal(lib.saveLibrary(broken, lib.seedLibrary()), false);
  assert.equal(lib.saveLibrary(null, lib.seedLibrary()), false);
});

test("validation rejects empty input and case- or whitespace-insensitive duplicate names", () => {
  const collections = [col("Sci-fi")];
  assert.equal(lib.collectionNameError("Non-fiction", collections), null);
  assert.match(lib.collectionNameError("", collections), /Enter a collection name/);
  assert.match(lib.collectionNameError("   ", collections), /Enter a collection name/);
  assert.match(lib.collectionNameError("  SCI-FI ", collections), /already exists/);
  assert.deepEqual(lib.bookErrors({ title: "T", author: "A" }), { title: null, author: null });
  assert.deepEqual(lib.bookErrors({ title: " ", author: "" }), {
    title: "Enter a title.",
    author: "Enter an author.",
  });
});

// --- rendering ---

test("server rendering without browser storage shows the seed collection", () => {
  assert.equal(typeof globalThis.window, "undefined");
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /<h1>Pocket Library<\/h1>/);
  assert.match(html, /<h2 id="reading-list-title">Sci-fi \(3 books\)<\/h2>/);
  assert.match(html, /aria-labelledby="reading-list-title"/);
  assert.deepEqual(
    [...html.matchAll(/<h3>(.*?)<\/h3><p>(.*?)<\/p>/g)].map((m) => [m[1], m[2]]),
    [
      ["Kindred", "Octavia E. Butler"],
      ["The Dispossessed", "Ursula K. Le Guin"],
      ["The Left Hand of Darkness", "Ursula K. Le Guin"],
    ],
  );
  assert.equal(renderToStaticMarkup(createElement(App)), html);
});

test("first run shows the seed collection and does not write until something changes", async () => {
  const storage = memoryStorage();
  await withPage(storage, async (page) => {
    assert.equal(page.h2(), "Sci-fi (3 books)");
    assert.deepEqual(page.titles(), SEED_TITLES);
    assert.equal(storage.writes, 0);
    await page.type("Title", "Dune");
    assert.equal(storage.writes, 0, "typing alone must not save");
  });
});

test("creating a collection opens it, saves it, and shows an empty state", async () => {
  const storage = memoryStorage();
  await withPage(storage, async (page) => {
    await page.type("New collection name", "  Non-fiction ");
    await page.submit("Create collection");
    assert.equal(page.h2(), "Non-fiction (0 books)");
    assert.match(page.text(), /No books in this collection yet/);
    assert.deepEqual(page.alerts(), []);
    assert.equal(page.container.querySelector("#new-collection").value, "");
    const saved = JSON.parse(storage.getItem(lib.STORAGE_KEY));
    assert.deepEqual(saved.collections.map((c) => c.name), ["Sci-fi", "Non-fiction"]);
    assert.equal(saved.open, 1);
  });
});

test("switching collections shows that collection's books and updates the headings", async () => {
  const storage = memoryStorage({
    [lib.STORAGE_KEY]: stored(1, [col("Sci-fi", "B", "A"), col("Non-fiction", "Only")]),
  });
  await withPage(storage, async (page) => {
    assert.equal(page.h2(), "Sci-fi (2 books)");
    assert.deepEqual(page.titles(), ["A", "B"]);
    await page.click("Non-fiction");
    assert.equal(page.h2(), "Non-fiction (1 book)");
    assert.deepEqual(page.titles(), ["Only"]);
    assert.equal(page.button("Non-fiction").getAttribute("aria-current"), "true");
    assert.equal(page.button("Sci-fi").getAttribute("aria-current"), null);
  });
});

test("adding a book trims and saves it into the open collection only, sorted by title", async () => {
  const storage = memoryStorage({
    [lib.STORAGE_KEY]: stored(1, [col("Sci-fi", "B"), col("Other", "Z")]),
  });
  await withPage(storage, async (page) => {
    await page.type("Title", " A New Book ");
    await page.type("Author", " Someone ");
    await page.submit("Add book");
    assert.deepEqual(page.titles(), ["A New Book", "B"]);
    assert.match(page.text(), /Someone/);
    assert.equal(page.container.querySelector("#book-title").value, "");
    const saved = JSON.parse(storage.getItem(lib.STORAGE_KEY));
    assert.deepEqual(saved.collections[0].books[1], { title: "A New Book", author: "Someone" });
    assert.equal(saved.collections[1].books.length, 1);
  });
});

test("removing a book removes only that entry, even when titles repeat, and saves", async () => {
  const dup = { name: "Dups", books: [{ title: "Same", author: "First" }, { title: "Same", author: "Second" }] };
  const storage = memoryStorage({ [lib.STORAGE_KEY]: stored(1, [dup]) });
  await withPage(storage, async (page) => {
    const [firstRemove] = page.container.querySelectorAll('button[aria-label="Remove Same"]');
    await act(() => firstRemove.click());
    assert.equal(page.h2(), "Dups (1 book)");
    assert.match(page.text(), /Second/);
    assert.doesNotMatch(page.text(), /First/);
    assert.deepEqual(JSON.parse(storage.getItem(lib.STORAGE_KEY)).collections[0].books, [
      { title: "Same", author: "Second" },
    ]);
  });
});

test("empty and duplicate input is rejected with a visible alert and nothing is saved", async () => {
  const storage = memoryStorage();
  await withPage(storage, async (page) => {
    await page.submit("Create collection");
    assert.deepEqual(page.alerts(), ["Error: Enter a collection name."]);
    assert.equal(page.container.querySelector("#new-collection").getAttribute("aria-invalid"), "true");

    await page.type("New collection name", " sci-FI ");
    await page.submit("Create collection");
    assert.match(page.alerts()[0], /already exists/);

    await page.submit("Add book");
    assert.deepEqual(page.alerts().slice(-2), ["Error: Enter a title.", "Error: Enter an author."]);
    await page.type("Title", "Only title");
    await page.submit("Add book");
    assert.deepEqual(page.alerts().slice(-1), ["Error: Enter an author."]);

    assert.equal(page.h2(), "Sci-fi (3 books)");
    assert.equal(storage.writes, 0);
  });
});

test("a reload over the same storage restores collections, books and the open collection", async () => {
  const storage = memoryStorage();
  await withPage(storage, async (page) => {
    await page.type("New collection name", "Non-fiction");
    await page.submit("Create collection");
    await page.type("Title", "Walden");
    await page.type("Author", "Thoreau");
    await page.submit("Add book");
    await page.click("Sci-fi");
    await page.click("Remove Kindred");
    await page.click("Non-fiction");

    await page.mount();
    assert.equal(page.h2(), "Non-fiction (1 book)");
    assert.deepEqual(page.titles(), ["Walden"]);
    await page.click("Sci-fi");
    assert.deepEqual(page.titles(), ["The Dispossessed", "The Left Hand of Darkness"]);
  });
});

test("corrupt or wrong-version storage renders the seed, and is replaced only on the next save", async () => {
  for (const raw of ["{broken", stored(99, [col("Gone", "X")])]) {
    const storage = memoryStorage({ [lib.STORAGE_KEY]: raw });
    await withPage(storage, async (page) => {
      assert.equal(page.h2(), "Sci-fi (3 books)");
      assert.equal(storage.getItem(lib.STORAGE_KEY), raw);
      await page.click("Remove Kindred");
      assert.equal(JSON.parse(storage.getItem(lib.STORAGE_KEY)).version, lib.STORAGE_VERSION);
      assert.equal(page.h2(), "Sci-fi (2 books)");
    });
  }
});

test("a failed save is announced in text and the change stays visible", async () => {
  const storage = memoryStorage();
  storage.setItem = () => { throw new Error("quota"); };
  await withPage(storage, async (page) => {
    await page.click("Remove Kindred");
    assert.equal(page.h2(), "Sci-fi (2 books)");
    assert.match(page.alerts()[0], /could not be saved/);
  });
});

test("Show authors starts on, hides authors in every collection, and is not persisted", async () => {
  const storage = memoryStorage({
    [lib.STORAGE_KEY]: stored(1, [col("Sci-fi", "A"), col("Non-fiction", "B")]),
  });
  await withPage(storage, async (page) => {
    const checkbox = () => page.container.querySelector('input[type="checkbox"]');
    assert.equal(checkbox().closest("label").textContent.trim(), "Show authors");
    assert.equal(checkbox().checked, true);
    assert.equal(page.container.querySelectorAll("li p").length, 1);

    await act(() => checkbox().click());
    assert.equal(checkbox().checked, false);
    assert.doesNotMatch(page.text(), /A author/);
    await page.click("Non-fiction");
    assert.equal(checkbox().checked, false);
    assert.doesNotMatch(page.text(), /B author/);

    await act(() => checkbox().click());
    assert.match(page.text(), /B author/);
    await act(() => checkbox().click());
    assert.equal(storage.writes, 1, "only the collection switch was saved");

    await page.mount();
    assert.equal(checkbox().checked, true);
  });
});

// --- Open Library: fake fetch only, the tests never touch the network ---

const json = (body, init = {}) => ({ ok: true, json: async () => body, ...init });
const doc = (title, author, cover) => ({ title, author_name: [author], ...(cover ? { cover_i: cover } : {}) });

// A fake whose responses the test settles by hand. It honours the abort signal like real fetch.
function manualFetch() {
  const calls = [];
  const fn = (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      calls.push({ url: new URL(url), signal, resolve, reject });
    });
  fn.calls = calls;
  return fn;
}
const flush = () => act(async () => { await Promise.resolve(); });

test("a request asks for only the needed fields, 10 results, and a cover URL that 404s when missing", async () => {
  const fetchFn = manualFetch();
  const pending = ol.searchBooks("le guin", new AbortController().signal, fetchFn);
  const { url } = fetchFn.calls[0];
  assert.equal(url.origin + url.pathname, "https://openlibrary.org/search.json");
  assert.equal(url.searchParams.get("q"), "le guin");
  assert.equal(url.searchParams.get("fields"), "title,author_name,cover_i");
  assert.equal(url.searchParams.get("limit"), "10");
  fetchFn.calls[0].resolve(json({ docs: [] }));
  assert.deepEqual(await pending, { kind: "ok", books: [] });
  assert.equal(ol.coverUrl(8745330), "https://covers.openlibrary.org/b/id/8745330-S.jpg?default=false");
});

test("candidates are validated: titles, authors, covers, non-object docs and the 10 limit", async () => {
  const docs = [
    doc("  Kindred ", "  Octavia E. Butler ", 8745330),
    { title: "   ", author_name: ["X"] },
    { title: 5, author_name: ["X"] },
    { author_name: ["X"] },
    null,
    "text",
    { title: "Mixed authors", author_name: [3, "  ", null, " Second "] },
    { title: "No authors" },
    { title: "Empty authors", author_name: [] },
    { title: "Author string", author_name: "Someone" },
    { title: "Zero cover", author_name: ["A"], cover_i: 0 },
    { title: "Float cover", author_name: ["A"], cover_i: 1.5 },
    { title: "String cover", author_name: ["A"], cover_i: "7" },
    ...Array.from({ length: 20 }, (_, i) => doc(`Extra ${i}`, "A")),
  ];
  const result = await ol.searchBooks("q", new AbortController().signal, async () => json({ docs }));
  assert.equal(result.kind, "ok");
  assert.equal(result.books.length, 10);
  assert.deepEqual(result.books.slice(0, 8), [
    { title: "Kindred", author: "Octavia E. Butler", cover: 8745330 },
    { title: "Mixed authors", author: "Second" },
    { title: "No authors", author: "Unknown author" },
    { title: "Empty authors", author: "Unknown author" },
    { title: "Author string", author: "Unknown author" },
    { title: "Zero cover", author: "A" },
    { title: "Float cover", author: "A" },
    { title: "String cover", author: "A" },
  ]);
});

test("searchBooks reports failures as values and never rejects", async () => {
  const reason = async (fetchFn) => (await ol.searchBooks("q", new AbortController().signal, fetchFn)).reason;
  assert.equal(await reason(async () => { throw new TypeError("offline"); }), "network");
  assert.equal(await reason(async () => json({}, { ok: false, status: 500 })), "status");
  assert.equal(await reason(async () => ({ ok: true, json: async () => { throw new SyntaxError("bad"); } })), "malformed");
  for (const body of [null, [], "x", {}, { docs: {} }]) {
    assert.equal(await reason(async () => json(body)), "malformed");
  }
});

test("a request that does not finish within 8 seconds is aborted and reported as a timeout", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const fetchFn = manualFetch();
    const pending = ol.searchBooks("q", new AbortController().signal, fetchFn);
    mock.timers.tick(7999);
    assert.equal(fetchFn.calls[0].signal.aborted, false);
    mock.timers.tick(1);
    assert.equal(fetchFn.calls[0].signal.aborted, true);
    assert.deepEqual(await pending, { kind: "failed", reason: "timeout" });
  } finally {
    mock.timers.reset();
  }
});

test("a caller abort is reported as cancelled, not as a failure", async () => {
  const controller = new AbortController();
  const fetchFn = manualFetch();
  const pending = ol.searchBooks("q", controller.signal, fetchFn);
  controller.abort();
  assert.deepEqual(await pending, { kind: "cancelled" });
  assert.deepEqual(await ol.searchBooks("q", controller.signal, fetchFn), { kind: "cancelled" });
});

test("parser keeps a valid cover, treats a missing or invalid one as absent, and round-trips it", () => {
  const book = (cover) => ({ title: "T", author: "A", ...(cover === undefined ? {} : { cover }) });
  const load = (cover) =>
    lib.loadLibrary(memoryStorage({ [lib.STORAGE_KEY]: stored(1, [{ name: "X", books: [book(cover)] }]) }));
  assert.deepEqual(load(undefined).collections[0].books, [{ title: "T", author: "A" }]);
  assert.deepEqual(load(42).collections[0].books, [{ title: "T", author: "A", cover: 42 }]);
  for (const bad of [0, -3, 1.5, "7", null, true]) {
    assert.deepEqual(load(bad).collections[0].books, [{ title: "T", author: "A" }], `cover ${bad}`);
    assert.equal(load(bad).collections[0].name, "X", "the library is not discarded");
  }
  const storage = memoryStorage();
  const library = { open: 0, collections: [{ name: "X", books: [book(42)] }] };
  lib.saveLibrary(storage, library);
  assert.deepEqual(lib.loadLibrary(storage), library);
  assert.equal(lib.STORAGE_VERSION, 1);
  assert.equal(lib.isCoverId(1), true);
  assert.equal(lib.isCoverId(0), false);
});

test("hasBook ignores case and surrounding spaces; addBookToOpen changes only the open collection", () => {
  const collection = { name: "X", books: [{ title: "Kindred", author: "Octavia E. Butler" }] };
  assert.equal(lib.hasBook(collection, { title: "  kindred ", author: "OCTAVIA e. butler  " }), true);
  assert.equal(lib.hasBook(collection, { title: "Kindred", author: "Someone else" }), false);
  assert.equal(lib.hasBook(collection, { title: "Dawn", author: "Octavia E. Butler" }), false);

  const library = { open: 1, collections: [col("A", "a1"), col("B", "b1"), col("C", "c1")] };
  const before = JSON.stringify(library);
  const added = { title: "New", author: "Au", cover: 5 };
  const next = lib.addBookToOpen(library, added);
  assert.equal(JSON.stringify(library), before, "input is not mutated");
  assert.equal(next.open, 1);
  assert.deepEqual(next.collections[1].books.at(-1), added);
  assert.equal(next.collections[1].books.length, 2);
  assert.deepEqual(next.collections[0], library.collections[0]);
  assert.deepEqual(next.collections[2], library.collections[2]);
});

const searchFor = async (page, text) => {
  await page.type("Find a book on Open Library", text);
  await page.click("Search");
};
const resultItems = (page) => [...page.container.querySelectorAll('ul[aria-label="Search results"] li')];

test("a search shows results with covers, Add saves the book with its cover, and it survives a reload", async () => {
  const storage = memoryStorage();
  const fetchFn = async () => json({ docs: [doc("Parable of the Sower", "Octavia E. Butler", 77), doc("Dawn", "Octavia E. Butler")] });
  await withPage(storage, async (page) => {
    await searchFor(page, "butler");
    await flush();
    const items = resultItems(page);
    assert.equal(items.length, 2);
    assert.equal(items[0].querySelector("img").getAttribute("src"), ol.coverUrl(77));
    assert.equal(items[0].querySelector("img").getAttribute("alt"), "");
    assert.equal(items[1].querySelector("img"), null);
    await page.click("Add Parable of the Sower");
    assert.equal(page.h2(), "Sci-fi (4 books)");
    assert.deepEqual(JSON.parse(storage.getItem(lib.STORAGE_KEY)).collections[0].books.at(-1), {
      title: "Parable of the Sower", author: "Octavia E. Butler", cover: 77,
    });
    await page.mount();
    assert.equal(page.h2(), "Sci-fi (4 books)");
    assert.equal(page.container.querySelectorAll("section > ul li img")[0].getAttribute("src"), ol.coverUrl(77));
  }, fetchFn);
});

test("a result already in the open collection is marked and disabled, while manual add allows duplicates", async () => {
  const fetchFn = async () => json({ docs: [doc(" kindred", "octavia e. BUTLER"), doc("Dawn", "Octavia E. Butler")] });
  await withPage(memoryStorage(), async (page) => {
    await searchFor(page, "kindred");
    await flush();
    const [first, second] = resultItems(page).map((li) => li.querySelector("button"));
    assert.equal(first.disabled, true);
    assert.equal(first.textContent, "Already added");
    assert.equal(second.disabled, false);
    await page.type("Title", "Kindred");
    await page.type("Author", "Octavia E. Butler");
    await page.click("Add book");
    assert.equal(page.h2(), "Sci-fi (4 books)");
  }, fetchFn);
});

test("Add goes to the collection that is open at that moment", async () => {
  const fetchFn = async () => json({ docs: [doc("Dawn", "Octavia E. Butler")] });
  await withPage(memoryStorage(), async (page) => {
    await page.type("New collection name", "Other");
    await page.submit("Create collection");
    await page.click("Sci-fi");
    await searchFor(page, "dawn");
    await flush();
    await page.click("Other");
    await page.click("Add Dawn");
    assert.equal(page.h2(), "Other (1 book)");
    await page.click("Sci-fi");
    assert.equal(page.h2(), "Sci-fi (3 books)");
  }, fetchFn);
});

test("an empty query is rejected next to the field without a request", async () => {
  let requests = 0;
  await withPage(memoryStorage(), async (page) => {
    await page.type("Find a book on Open Library", "   ");
    await page.click("Search");
    assert.deepEqual(page.alerts(), ["Error: Enter a title or author to search for."]);
    assert.equal(page.container.querySelector("#book-search").getAttribute("aria-invalid"), "true");
    assert.equal(requests, 0);
  }, async () => { requests += 1; return json({ docs: [] }); });
});

test("loading, no results and each failure are shown as text and a retry works", async () => {
  const fetchFn = manualFetch();
  await withPage(memoryStorage(), async (page) => {
    await searchFor(page, "nothing");
    assert.match(page.text(), /Searching/);
    fetchFn.calls[0].resolve(json({ docs: [] }));
    await flush();
    assert.doesNotMatch(page.text(), /Searching/);
    assert.match(page.text(), /No books found/);

    const failures = [
      [(call) => call.reject(new TypeError("offline")), /Could not reach Open Library/],
      [(call) => call.resolve(json({}, { ok: false, status: 503 })), /could not run the search/],
      [(call) => call.resolve({ ok: true, json: async () => { throw new SyntaxError("x"); } }), /cannot read/],
    ];
    for (const [fail, message] of failures) {
      await searchFor(page, "again");
      fail(fetchFn.calls.at(-1));
      await flush();
      assert.equal(page.alerts().length, 1);
      assert.match(page.alerts()[0], message);
      assert.doesNotMatch(page.text(), /Searching/);
    }
    await searchFor(page, "retry");
    fetchFn.calls.at(-1).resolve(json({ docs: [doc("Dawn", "Octavia E. Butler")] }));
    await flush();
    assert.deepEqual(page.alerts(), []);
    assert.equal(resultItems(page).length, 1);
  }, fetchFn);
});

test("a search that never answers times out after 8 seconds with a visible message", async () => {
  const fetchFn = manualFetch();
  await withPage(memoryStorage(), async (page) => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      await searchFor(page, "slow");
      assert.match(page.text(), /Searching/);
      await act(async () => { mock.timers.tick(8000); });
      await flush();
    } finally {
      mock.timers.reset();
    }
    assert.match(page.alerts()[0], /timed out/);
    assert.doesNotMatch(page.text(), /Searching/);
    await searchFor(page, "slow again");
    assert.match(page.text(), /Searching/);
  }, fetchFn);
});

test("overlapping searches: the earlier request is aborted, only the latest shows, loading clears with the latest", async () => {
  const fetchFn = manualFetch();
  await withPage(memoryStorage(), async (page) => {
    await searchFor(page, "first");
    await searchFor(page, "second");
    const [first, second] = fetchFn.calls;
    assert.equal(first.signal.aborted, true);
    assert.equal(second.signal.aborted, false);
    // The earlier response arrives late anyway, as if the abort had not stopped it.
    first.resolve(json({ docs: [doc("Old result", "Old Author")] }));
    await flush();
    assert.match(page.text(), /Searching/, "a superseded search must not clear loading");
    assert.equal(resultItems(page).length, 0);
    second.resolve(json({ docs: [doc("New result", "New Author")] }));
    await flush();
    assert.doesNotMatch(page.text(), /Searching/);
    assert.deepEqual(resultItems(page).map((li) => li.querySelector("h3").textContent), ["New result"]);
  }, fetchFn);
});

test("a late failure from a superseded search shows nothing, and unmounting aborts the request", async () => {
  const fetchFn = manualFetch();
  await withPage(memoryStorage(), async (page) => {
    await searchFor(page, "first");
    await searchFor(page, "second");
    fetchFn.calls[0].reject(new TypeError("late"));
    await flush();
    assert.deepEqual(page.alerts(), []);
    const errors = [];
    const log = console.error;
    console.error = (...args) => errors.push(args);
    try {
      await page.unmount();
      fetchFn.calls[1].resolve(json({ docs: [doc("After unmount", "A")] }));
      await flush();
    } finally {
      console.error = log;
    }
    assert.equal(fetchFn.calls[1].signal.aborted, true);
    assert.deepEqual(errors, []);
  }, fetchFn);
});

test("a cover that fails to load is removed and stays removed; a neighbour's cover survives a removal", async () => {
  const storage = memoryStorage({
    [lib.STORAGE_KEY]: stored(1, [
      { name: "X", books: [
        { title: "A", author: "a", cover: 1 },
        { title: "B", author: "b", cover: 2 },
        { title: "C", author: "c" },
      ] },
    ]),
  });
  const fetchFn = async () => json({ docs: [doc("R1", "r", 11), doc("R2", "r", 12)] });
  await withPage(storage, async (page) => {
    const listImgs = () => [...page.container.querySelectorAll("section > ul li img")].map((i) => i.getAttribute("src"));
    assert.deepEqual(listImgs(), [ol.coverUrl(1), ol.coverUrl(2)]);
    const fail = (img) => act(() => img.dispatchEvent(new page.container.ownerDocument.defaultView.Event("error")));
    await fail(page.container.querySelector("section > ul li img"));
    assert.deepEqual(listImgs(), [ol.coverUrl(2)]);
    await act(() => page.container.querySelector('input[type="checkbox"]').click());
    assert.deepEqual(listImgs(), [ol.coverUrl(2)], "a re-render keeps the failed cover hidden");

    // Index-keyed list: after A is removed, B reuses A's component instance and must still show.
    await page.click("Remove A");
    assert.deepEqual(listImgs(), [ol.coverUrl(2)]);

    await searchFor(page, "r");
    await flush();
    const resultImgs = () => resultItems(page).map((li) => li.querySelector("img")?.getAttribute("src") ?? null);
    assert.deepEqual(resultImgs(), [ol.coverUrl(11), ol.coverUrl(12)]);
    await fail(resultItems(page)[0].querySelector("img"));
    assert.deepEqual(resultImgs(), [null, ol.coverUrl(12)]);
  }, fetchFn);
});

// --- due dates and the read flag ---

test("the shared date rule accepts real calendar dates and rejects everything else", () => {
  for (const ok of ["2024-02-29", "2025-12-31", "1000-01-01", "9999-12-31"]) {
    assert.equal(lib.isDueDate(ok), true, ok);
  }
  const bad = ["2025-02-30", "2023-02-29", "1900-02-29", "2025-13-01", "2025-00-10", "2025-01-00",
    "2025-04-31", "999-01-01", "0999-01-01", "0099-01-01", "25-01-01", "2025-1-05", "2025-01-5",
    " 2025-01-05", "2025-01-05 ", "2025-01-05T00:00", "x2025-01-05", "", "  ", null, undefined, 20250105, {}];
  for (const value of bad) assert.equal(lib.isDueDate(value), false, String(value));
});

test("dueStatus covers each status, the 14-day window boundary, today versus one day late", () => {
  const status = (dueDate, today, extra = {}) => lib.dueStatus({ title: "T", author: "A", dueDate, ...extra }, today);
  assert.deepEqual(status("2025-07-01", "2025-06-15"), { status: "upcoming", days: 16 });
  assert.deepEqual(status("2025-06-29", "2025-06-15"), { status: "approaching", days: 14 });
  assert.deepEqual(status("2025-06-30", "2025-06-15"), { status: "upcoming", days: 15 });
  assert.deepEqual(status("2025-06-16", "2025-06-15"), { status: "approaching", days: 1 });
  assert.deepEqual(status("2025-06-15", "2025-06-15"), { status: "due-today", days: 0 });
  assert.deepEqual(status("2025-06-14", "2025-06-15"), { status: "overdue", days: 1 });
  assert.deepEqual(status("2025-05-15", "2025-06-15"), { status: "overdue", days: 31 });
  // month and year boundaries, and a leap day
  assert.deepEqual(status("2026-01-02", "2025-12-31"), { status: "approaching", days: 2 });
  assert.deepEqual(status("2025-12-30", "2026-01-02"), { status: "overdue", days: 3 });
  assert.deepEqual(status("2024-03-01", "2024-02-28"), { status: "approaching", days: 2 });
  assert.deepEqual(status("2025-03-01", "2025-02-28"), { status: "approaching", days: 1 });
  // none: read, no date, invalid date, unparseable today
  const none = { status: "none", days: 0 };
  assert.deepEqual(status("2025-06-14", "2025-06-15", { read: true }), none);
  assert.deepEqual(status(undefined, "2025-06-15"), none);
  assert.deepEqual(status("2025-02-30", "2025-06-15"), none);
  assert.deepEqual(status("2025-06-14", "not a date"), none);
});

test("todayString formats the local calendar date, not the UTC one", () => {
  assert.equal(lib.todayString(new Date(2025, 0, 5, 23, 59, 59)), "2025-01-05");
  assert.equal(lib.todayString(new Date(2025, 11, 31, 0, 0, 1)), "2025-12-31");
  assert.match(lib.todayString(), /^\d{4}-\d{2}-\d{2}$/);
});

test("the due date input validator treats empty as no date and rejects invalid text", () => {
  assert.equal(lib.dueDateError(""), null);
  assert.equal(lib.dueDateError("   "), null);
  assert.equal(lib.dueDateError(" 2025-02-28 "), null);
  assert.equal(lib.dueDateError("2020-01-01"), null, "a past date is accepted");
  for (const bad of ["2025-02-30", "2025-13-01", "soon", "2025-1-1"]) {
    assert.match(lib.dueDateError(bad), /real date/, bad);
  }
});

test("due date and read flag round-trip; bad ones are dropped from their book only", () => {
  const storage = memoryStorage();
  const library = { open: 0, collections: [{ name: "X", books: [
    { title: "A", author: "a", cover: 3, dueDate: "2025-07-01", read: true },
    { title: "B", author: "b", dueDate: "2025-07-02" },
  ] }] };
  lib.saveLibrary(storage, library);
  assert.deepEqual(lib.loadLibrary(storage), library);
  assert.equal(lib.STORAGE_VERSION, 1);

  const badFields = [
    { dueDate: "2025-02-30" }, { dueDate: "" }, { dueDate: "  " }, { dueDate: 20250701 },
    { dueDate: "2025-7-1" }, { read: false }, { read: "true" }, { read: 1 },
  ];
  for (const bad of badFields) {
    const raw = stored(1, [{ name: "X", books: [{ title: "A", author: "a", cover: 9, ...bad }, { title: "B", author: "b", dueDate: "2025-07-02" }] }, col("Y", "k")]);
    const loaded = lib.loadLibrary(memoryStorage({ [lib.STORAGE_KEY]: raw }));
    assert.deepEqual(loaded.collections[0].books, [
      { title: "A", author: "a", cover: 9 },
      { title: "B", author: "b", dueDate: "2025-07-02" },
    ], JSON.stringify(bad));
    assert.equal(loaded.collections.length, 2, "the rest of the library is kept");
  }
  // old-shape data, with and without covers, is unchanged
  const old = [{ name: "X", books: [{ title: "A", author: "a" }, { title: "B", author: "b", cover: 4 }] }];
  assert.deepEqual(lib.loadLibrary(memoryStorage({ [lib.STORAGE_KEY]: stored(1, old) })).collections, old);
});

const dueLib = (...books) => ({ [lib.STORAGE_KEY]: stored(1, [{ name: "X", books }]) });
const savedBooks = (storage) => JSON.parse(storage.getItem(lib.STORAGE_KEY)).collections[0].books;
const badges = (page) => [...page.container.querySelectorAll(".badge")].map((n) => n.textContent);
const dueInput = (page, title) => page.container.querySelector(`#${[...page.container.querySelectorAll("label")].find((l) => l.textContent === `Due date for ${title}`).htmlFor}`);

test("badges show distinct text for each status and none for books without a date", async () => {
  const storage = memoryStorage(dueLib(
    { title: "A", author: "a", dueDate: "2025-08-01" },
    { title: "B", author: "b", dueDate: "2025-06-20" },
    { title: "C", author: "c", dueDate: "2025-06-15" },
    { title: "D", author: "d", dueDate: "2025-06-13" },
    { title: "E", author: "e" },
    { title: "F", author: "f", dueDate: "2025-06-13", read: true },
  ));
  await withPage(storage, async (page) => {
    assert.deepEqual(badges(page), ["Due in 47 days", "Due soon: in 5 days", "Due today", "Overdue by 2 days", "Read"]);
    assert.equal(page.container.querySelectorAll(".badge.overdue").length, 1);
    assert.equal(page.container.querySelectorAll(".badge.approaching").length, 1);
    // 5 unread books have a date control, the read book does not; plus the Add form's field
    assert.equal(page.container.querySelectorAll('input[type="date"]').length, 5 + 1);
    assert.equal(page.button("Mark unread: F") !== undefined, true);
  });
});

test("a due date can be set, changed and cleared on an existing book; an empty submit errors", async () => {
  const storage = memoryStorage(dueLib({ title: "A", author: "a" }, { title: "B", author: "b" }));
  await withPage(storage, async (page) => {
    assert.equal(page.button("Clear due date for A"), undefined, "no Clear without a date");
    await page.type("Due date for A", "2025-06-20");
    assert.equal(storage.writes, 0, "typing alone saves nothing");
    await page.click("Set due date for A");
    assert.deepEqual(savedBooks(storage)[0], { title: "A", author: "a", dueDate: "2025-06-20" });
    assert.deepEqual(badges(page), ["Due soon: in 5 days"]);
    assert.equal(savedBooks(storage)[1].dueDate, undefined, "the neighbour is untouched");

    await page.type("Due date for A", "2025-06-10");
    await page.click("Set due date for A");
    assert.equal(savedBooks(storage)[0].dueDate, "2025-06-10", "a past date is accepted");
    assert.deepEqual(badges(page), ["Overdue by 5 days"]);

    // an empty submit shows the error and commits nothing
    await page.type("Due date for A", "");
    const writes = storage.writes;
    await page.click("Set due date for A");
    assert.deepEqual(page.alerts(), ["Error: Enter a date, or use Clear due date."]);
    assert.equal(dueInput(page, "A").getAttribute("aria-invalid"), "true");
    assert.equal(storage.writes, writes);
    assert.equal(savedBooks(storage)[0].dueDate, "2025-06-10");

    await page.click("Clear due date for A");
    assert.equal(savedBooks(storage)[0].dueDate, undefined);
    assert.deepEqual(badges(page), []);
    assert.equal(page.button("Clear due date for A"), undefined);
  });
});

test("a due date set in the Add form is saved with the book; empty adds none", async () => {
  const storage = memoryStorage();
  await withPage(storage, async (page) => {
    await page.type("Title", "Dune");
    await page.type("Author", "Herbert");
    await page.type("Due date (optional)", "2025-06-16");
    await page.click("Add book");
    await page.type("Title", "Emma");
    await page.type("Author", "Austen");
    await page.click("Add book");
    const books = savedBooks(storage);
    assert.deepEqual(books.at(-2), { title: "Dune", author: "Herbert", dueDate: "2025-06-16" });
    assert.deepEqual(books.at(-1), { title: "Emma", author: "Austen" });
    assert.equal(page.container.querySelector("#book-due").value, "");
    assert(badges(page).includes("Due soon: in 1 day"));
  });
});

test("marking read keeps the date but hides it; unread restores it without a stored read:false", async () => {
  const storage = memoryStorage(dueLib({ title: "A", author: "a", dueDate: "2025-06-10" }, { title: "B", author: "b" }));
  await withPage(storage, async (page) => {
    await page.click("Mark read: A");
    assert.deepEqual(savedBooks(storage)[0], { title: "A", author: "a", dueDate: "2025-06-10", read: true });
    assert.deepEqual(badges(page), ["Read"]);
    assert.equal(page.container.querySelectorAll("#due-0").length, 0, "no date control for a read book");
    assert.equal(page.button("Clear due date for A"), undefined);

    await page.mount();
    assert.deepEqual(badges(page), ["Read"], "read survives a reload");

    await page.click("Mark unread: A");
    assert.deepEqual(badges(page), ["Overdue by 5 days"]);
    assert.equal(dueInput(page, "A").value, "2025-06-10");
    const first = savedBooks(storage)[0];
    assert.deepEqual(first, { title: "A", author: "a", dueDate: "2025-06-10" });
    assert.equal("read" in first, false);

    // read then unread stores the same as never read
    await page.click("Mark read: B");
    await page.click("Mark unread: B");
    assert.deepEqual(savedBooks(storage)[1], { title: "B", author: "b" });
    assert.equal(JSON.stringify(savedBooks(storage)[1]), JSON.stringify({ title: "B", author: "b" }));
  });
});

test("a draft in one book's date input does not move to a neighbour after a removal", async () => {
  const storage = memoryStorage(dueLib(
    { title: "A", author: "a" },
    { title: "B", author: "b", dueDate: "2025-07-01" },
    { title: "C", author: "c" },
  ));
  await withPage(storage, async (page) => {
    await page.type("Due date for A", "2025-09-09");
    await page.click("Remove A");
    assert.equal(dueInput(page, "B").value, "2025-07-01");
    assert.equal(dueInput(page, "C").value, "");
    assert.equal(page.container.querySelector("input[value='2025-09-09']"), null);
    assert.equal(storage.writes, 1, "only the removal was saved");
  });
});

test("due dates and read flags persist across a reload", async () => {
  const storage = memoryStorage(dueLib({ title: "A", author: "a" }, { title: "B", author: "b" }));
  await withPage(storage, async (page) => {
    await page.type("Due date for A", "2025-06-18");
    await page.click("Set due date for A");
    await page.click("Mark read: B");
    await page.mount();
    assert.deepEqual(badges(page), ["Due soon: in 3 days", "Read"]);
    assert.equal(dueInput(page, "A").value, "2025-06-18");
  });
});
