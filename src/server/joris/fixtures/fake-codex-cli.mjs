#!/usr/bin/env node
// Fake `codex` CLI for tests: no network, no account. Echoes stdin back with
// accents, writing the UTF-8 bytes in two chunks split inside a character.
import { setTimeout as sleep } from "node:timers/promises";
let args = process.argv.slice(2);
const delayArg = args.find(a => a.startsWith("--fake-delay="));
args = args.filter(a => a !== delayArg);
if (args[0] === "login") { process.stdout.write("Logged in using ChatGPT\n"); process.exit(0); }
const delay = delayArg ? Number(delayArg.split("=")[1]) : 0;
let input = "";
process.stdin.setEncoding("utf8");
for await (const c of process.stdin) input += c;
if (delay) await sleep(delay);
const line1 = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: `Reçu : ${input} — éàçô` } });
const bytes = Buffer.from(line1 + "\n" + JSON.stringify({ type: "turn.completed", model: "fixture-codex" }) + "\n", "utf8");
const cut = bytes.indexOf(Buffer.from("ç", "utf8")) + 1; // split inside the 2-byte "ç"
process.stdout.write(bytes.subarray(0, cut));
await sleep(20);
process.stdout.write(bytes.subarray(cut));
