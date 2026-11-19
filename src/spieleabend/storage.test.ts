import assert from "node:assert/strict";
import test from "node:test";
import { LANG_KEY, STORE_KEY, THEME_KEY, emptyStore, loadStore, parseStore, resetStore, saveStore, serializeStore, type Store } from "./storage.ts";

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    data,
    writes,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(`set:${key}`);
      data.set(key, value);
    },
    removeItem: (key: string) => {
      writes.push(`remove:${key}`);
      data.delete(key);
    },
  };
}

function sample(): Store {
  return {
    players: [
      { id: "a", name: "Mia", skill: 7, present: true },
      { id: "b", name: "Ben", skill: 3, present: false },
    ],
    settings: { sides: 20, count: 3, modifier: -2, teamCount: 3, teamMode: "random", starterOnly: true, tab: "teams" },
    history: [{ kind: "roll", at: "2026-11-19T11:00:00.000Z", sides: 20, count: 3, modifier: -2, rolls: [4, 19, 7], total: 28 }],
  };
}

test("players, settings and history round-trip under one key", () => {
  assert.equal(STORE_KEY, "consolecheat-spieleabend-v1");
  const local = memory();
  assert.ok(saveStore(local, sample()));
  assert.deepEqual(local.writes, [`set:${STORE_KEY}`]);
  const raw = JSON.parse(local.data.get(STORE_KEY)!);
  assert.equal(raw.schema, "consolecheat-spieleabend");
  assert.equal(raw.version, 1);
  const { store, corrupt } = loadStore(local);
  assert.equal(corrupt, false);
  assert.deepEqual(store, sample());
  assert.equal(serializeStore(store), serializeStore(sample()));
});

test("corrupt or foreign data falls back without crashing; bad parts are skipped", () => {
  assert.deepEqual(parseStore(null), { store: emptyStore(), corrupt: false });
  assert.deepEqual(parseStore("{nope"), { store: emptyStore(), corrupt: true });
  assert.deepEqual(parseStore("[]"), { store: emptyStore(), corrupt: true });
  assert.deepEqual(parseStore(JSON.stringify({ schema: "other", version: 1 })), { store: emptyStore(), corrupt: true });
  assert.deepEqual(parseStore(JSON.stringify({ schema: "consolecheat-spieleabend", version: 9 })), { store: emptyStore(), corrupt: true });
  const good = JSON.parse(serializeStore(sample()));
  const broken = {
    ...good,
    players: [...good.players, { name: "" }, { name: "x".repeat(80), skill: 50 }, 7],
    settings: { ...good.settings, sides: 5000, tab: "nope" },
    history: [...good.history, { kind: "roll", at: "bad" }],
  };
  const result = parseStore(JSON.stringify(broken));
  assert.equal(result.corrupt, true);
  assert.equal(result.store.players.length, 3);
  assert.equal(result.store.players[2]!.name.length, 40);
  assert.equal(result.store.players[2]!.skill, 10);
  assert.equal(result.store.settings.sides, 6, "bad value falls back to the default");
  assert.equal(result.store.settings.tab, "dice");
  assert.equal(result.store.settings.count, 3, "good values are kept");
  assert.equal(result.store.history.length, 1);
  const throwing = {
    getItem(): string | null {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("full");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(loadStore(throwing).store, emptyStore());
  assert.equal(saveStore(throwing, sample()), false);
  assert.equal(resetStore(throwing), false);
});

test("stored history is capped at 50 and players at 100", () => {
  const good = JSON.parse(serializeStore(sample()));
  const history = Array.from({ length: 70 }, () => good.history[0]);
  const players = Array.from({ length: 130 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, skill: 5, present: true }));
  const { store } = parseStore(JSON.stringify({ ...good, history, players }));
  assert.equal(store.history.length, 50);
  assert.equal(store.players.length, 100);
  assert.equal(JSON.parse(serializeStore({ ...store, history: [...store.history, ...store.history] })).history.length, 50);
});

test("reset removes only this tool's key", () => {
  const others = {
    [LANG_KEY]: "en",
    [THEME_KEY]: "light",
    "consolecheat-ex6-merkliste-v1": "{}",
    "consolecheat-nonogram-v1": "{}",
  };
  const local = memory(others);
  saveStore(local, sample());
  assert.ok(resetStore(local));
  assert.equal(local.data.has(STORE_KEY), false);
  for (const [key, value] of Object.entries(others)) assert.equal(local.data.get(key), value, key);
  assert.deepEqual(local.writes, [`set:${STORE_KEY}`, `remove:${STORE_KEY}`]);
});
