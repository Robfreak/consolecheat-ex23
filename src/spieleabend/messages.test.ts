import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { copy, fill, initialLang, isLang } from "./messages.ts";

function shape(value: unknown, path = ""): string[] {
  if (typeof value === "string") return [`${path}:${[...value.matchAll(/\{([A-Za-z0-9]+)\}/g)].map((m) => m[1]).sort().join(",")}`];
  if (value && typeof value === "object") return Object.keys(value).sort().flatMap((key) => shape((value as Record<string, unknown>)[key], `${path}.${key}`));
  return [`${path}:?`];
}

test("German and English have the same keys and placeholders", () => {
  assert.deepEqual(shape(copy.de), shape(copy.en));
  for (const lang of ["de", "en"] as const) {
    for (const line of shape(copy[lang])) assert.ok(!line.endsWith(":?"), line);
  }
});

test("German is the default language", () => {
  assert.equal(initialLang(null), "de");
  assert.equal(initialLang("fr"), "de");
  assert.equal(initialLang("en"), "en");
  assert.ok(isLang("de"));
  assert.equal(fill("{a} und {b}", { a: 1 }), "1 und {b}");
});

test("the storage note names the key, and the UI announces results", () => {
  for (const lang of ["de", "en"] as const) assert.match(copy[lang].storageNote, /consolecheat-spieleabend-v1/);
  const ui = readFileSync(new URL("./Spieleabend.tsx", import.meta.url), "utf8");
  assert.match(ui, /role="tablist"/);
  assert.match(ui, /role="tab"/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(ui, /prefers-reduced-motion: reduce/);
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
});
