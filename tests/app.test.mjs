import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ts from "typescript";

const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
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
const { App } = module.exports;

// Render the real static component: verify all seeds and excluded controls, not browser behavior.
test("the baseline contains three books in a labelled reading-list section", () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /<h1>Pocket Library<\/h1>/);
  assert.match(html, /aria-labelledby="reading-list-title"/);
  assert.match(html, /id="reading-list-title"/);
  assert.equal((html.match(/<li>/g) ?? []).length, 3);
  for (const title of ["The Left Hand of Darkness", "The Dispossessed", "Kindred"]) {
    assert(html.includes(title));
  }
  assert(html.includes("Ursula K. Le Guin"));
  assert(html.includes("Octavia E. Butler"));
  assert.doesNotMatch(html, /<(form|input|button|select|a)\b/);
});

test("repeated renders remain identical without browser globals or persistence", () => {
  assert.equal(typeof globalThis.window, "undefined");
  const first = renderToStaticMarkup(createElement(App));
  assert.equal(renderToStaticMarkup(createElement(App)), first);
});
