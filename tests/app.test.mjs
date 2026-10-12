import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
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
async function withPage(storage, run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test" });
  const globals = ["window", "document", "localStorage", "IS_REACT_ACT_ENVIRONMENT"];
  const descriptors = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  let root;
  const container = dom.window.document.getElementById("root");
  const page = {
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
    mount: async () => {
      if (root) await act(() => root.unmount());
      root = createRoot(container);
      await act(() => root.render(createElement(App)));
    },
  };
  try {
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = storage;
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
