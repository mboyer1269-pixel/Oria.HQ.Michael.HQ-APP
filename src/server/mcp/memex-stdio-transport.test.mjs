import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { readMemexToolText } = await jiti.import("./memex-stdio-transport.ts");

test("MCP error text cannot be treated as memory evidence", () => {
  assert.throws(() => readMemexToolText({ isError: true, content: [{ type: "text", text: "private diagnostic" }] }), /rejected/);
});

test("only typed text blocks enter the memory corridor", () => {
  assert.equal(readMemexToolText({ content: [null, { type: "image", data: "ignored" }, { type: "text", text: 12 }, { type: "text", text: "Decision" }, { type: "text", text: "Source" }] }), "Decision\nSource");
  assert.throws(() => readMemexToolText({ content: { private: "data" } }), /unsupported/);
  assert.equal(readMemexToolText({ content: [] }), "");
});
