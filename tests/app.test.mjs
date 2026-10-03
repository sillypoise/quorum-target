import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import ts from "typescript";

const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
function loadApp(componentSource) {
  const compiled = ts.transpileModule(componentSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(`(function(require,module,exports){${compiled}\n})`)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  return module.exports.App;
}
const App = loadApp(source);

// Server rendering verifies the initial state and list fixtures.
test("the baseline contains three books in a labelled reading-list section", () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /<h1>Pocket Library \(3 books\)<\/h1>/);
  assert.match(html, /<h2 id="reading-list-title">Books to read<\/h2>/);
  assert.match(html, /aria-labelledby="reading-list-title"/);
  assert.match(html, /id="reading-list-title"/);
  assert.equal((html.match(/<li>/g) ?? []).length, 3);
  for (const title of ["The Left Hand of Darkness", "The Dispossessed", "Kindred"]) {
    assert(html.includes(title));
  }
  assert(html.includes("Ursula K. Le Guin"));
  assert(html.includes("Octavia E. Butler"));
  assert.deepEqual(
    [...html.matchAll(/<li><h3>(.*?)<\/h3><p>(.*?)<\/p><\/li>/g)].map((match) => [match[1], match[2]]),
    [
      ["Kindred", "Octavia E. Butler"],
      ["The Dispossessed", "Ursula K. Le Guin"],
      ["The Left Hand of Darkness", "Ursula K. Le Guin"],
    ],
  );
  assert.match(html, /<label><input type="checkbox" checked=""\/>Show authors<\/label>/);
  assert.doesNotMatch(html, /<(form|button|select|a)\b/);
});

for (const count of [0, 1]) {
  test(`the heading reflects a ${count}-book list without changing the section heading`, () => {
    const booksDeclaration = /const books = \[[\s\S]*?\];/;
    assert.match(source, booksDeclaration);
    const books = Array.from({ length: count }, () => ({ title: "Test book", author: "Test author" }));
    const FixtureApp = loadApp(source.replace(booksDeclaration, `const books = ${JSON.stringify(books)};`));
    const html = renderToStaticMarkup(createElement(FixtureApp));
    assert(html.includes(`<h1>Pocket Library (${count} books)</h1>`));
    assert.match(html, /<h2 id="reading-list-title">Books to read<\/h2>/);
    assert.equal((html.match(/<li>/g) ?? []).length, count);
    if (count === 1) assert.match(html, /<li><h3>Test book<\/h3><p>Test author<\/p><\/li>/);
  });
}

test("sorting uses full titles, preserves equal-title authors, and does not mutate the source", () => {
  const booksDeclaration = /const books = \[[\s\S]*?\];/;
  assert.match(source, booksDeclaration);
  const books = [
    { title: "The Zebra", author: "First" },
    { title: "The Apple", author: "Second" },
    { title: "The Apple", author: "Third" },
    { title: "Zebra", author: "Fourth" },
    { title: "apple", author: "Fifth" },
  ];
  const FixtureApp = loadApp(source.replace(
    booksDeclaration,
    `const books = Object.freeze(${JSON.stringify(books)});`,
  ));
  const html = renderToStaticMarkup(createElement(FixtureApp));
  assert.deepEqual(
    [...html.matchAll(/<li><h3>(.*?)<\/h3><p>(.*?)<\/p><\/li>/g)].map((match) => [match[1], match[2]]),
    [
      ["The Apple", "Second"],
      ["The Apple", "Third"],
      ["The Zebra", "First"],
      ["Zebra", "Fourth"],
      ["apple", "Fifth"],
    ],
  );
});

test("repeated renders remain identical without browser globals or persistence", () => {
  assert.equal(typeof globalThis.window, "undefined");
  const first = renderToStaticMarkup(createElement(App));
  assert.equal(renderToStaticMarkup(createElement(App)), first);
});

for (const count of [0, 1, 3]) {
  test(`Show authors toggles without persistence for a ${count}-book list`, async () => {
    const FixtureApp = count === 3 ? App : loadApp(source.replace(
      /const books = \[[\s\S]*?\];/,
      `const books = ${JSON.stringify(Array.from({ length: count }, () => ({ title: "Test book", author: "Test author" })))};`,
    ));
    const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test" });
    const globals = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"];
    const descriptors = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
    let root;
    try {
      globalThis.window = dom.window;
      globalThis.document = dom.window.document;
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      for (const key of ["localStorage", "sessionStorage"]) {
        Object.defineProperty(dom.window, key, {
          get() { throw new Error("Author visibility must not access storage"); },
        });
      }
      const container = document.getElementById("root");
      root = createRoot(container);
      await act(() => root.render(createElement(FixtureApp)));
      const checkbox = container.querySelector('input[type="checkbox"]');
      assert(checkbox);
      assert.equal(checkbox.closest("label").textContent.trim(), "Show authors");
      assert.equal(checkbox.checked, true);
      const titles = [...container.querySelectorAll("li h3")].map((node) => node.textContent);
      assert.equal(titles.length, count);
      assert.equal(container.querySelectorAll("li p").length, count);

      await act(() => checkbox.click());
      assert.equal(checkbox.checked, false);
      assert.equal(container.querySelectorAll("li p").length, 0);
      for (const author of ["Test author", "Ursula K. Le Guin", "Octavia E. Butler"]) {
        assert(!container.textContent.includes(author));
      }
      assert.deepEqual([...container.querySelectorAll("li h3")].map((node) => node.textContent), titles);

      await act(() => checkbox.click());
      assert.equal(checkbox.checked, true);
      assert.equal(container.querySelectorAll("li p").length, count);
      await act(() => checkbox.click());
      await act(() => root.unmount());
      root = createRoot(container);
      await act(() => root.render(createElement(FixtureApp)));
      assert.equal(container.querySelector("input").checked, true);
      assert.equal(container.querySelectorAll("li p").length, count);
    } finally {
      if (root) await act(() => root.unmount());
      dom.window.close();
      globals.forEach((key, index) => {
        if (descriptors[index]) Object.defineProperty(globalThis, key, descriptors[index]);
        else delete globalThis[key];
      });
    }
  });
}
