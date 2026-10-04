import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup, renderToReadableStream } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" } });
const { Tooltip } = await jiti.import("./tooltip.tsx");
const tooltip = (children) => createElement(Tooltip, { title: "Runtime", detail: "Details" }, children);
const link = () => createElement("a", { href: "/hq/runtime", "aria-describedby": "existing" }, "Runtime");

function assertAccessibleLink(html) {
  assert.match(html, /href="\/hq\/runtime"/);
  const description = html.match(/aria-describedby="existing ([^"]+)"/);
  assert.ok(description, "the existing description and tooltip id stay on the link");
  assert.ok(html.includes(`id="${description[1]}" role="tooltip"`));
  assert.doesNotMatch(html, /tabindex=/, "links must not gain a second keyboard stop");
  assert.match(html, /focus-visible:outline-2/);
  assert.match(html, /aria-hidden="true"/);
}

test("preserves a direct link's navigation and accessible description", () => {
  assertAccessibleLink(renderToStaticMarkup(tooltip(link())));
});

test("resolves a Flight-style lazy child before reading props or cloning", () => {
  // Shape produced by React Flight createLazyChunkWrapper for a streamed slot.
  const child = { $$typeof: Symbol.for("react.lazy"), _payload: link(), _init: (value) => value };
  assert.equal(child.props, undefined);
  assertAccessibleLink(renderToStaticMarkup(tooltip(child)));
});

test("suspends and resumes a pending child through React's children traversal", async () => {
  let resolve;
  const child = new Promise((done) => { resolve = done; });
  const rendering = renderToReadableStream(tooltip(child));
  resolve(link());
  const stream = await rendering;
  await stream.allReady;
  assertAccessibleLink(await new Response(stream).text());
});

test("keeps visual triggers keyboard focusable", () => {
  const html = renderToStaticMarkup(tooltip(createElement("span", null, "Status")));
  assert.match(html, /tabindex="0"/);
});

test("rejects unsupported triggers before cloneElement", () => {
  for (const child of [null, "text", [link(), link()]]) {
    assert.throws(() => renderToStaticMarkup(tooltip(child)), /exactly one React element/);
  }
});
