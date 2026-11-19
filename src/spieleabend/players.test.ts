import assert from "node:assert/strict";
import test from "node:test";
import { addEntry, HISTORY_MAX, parseEntry, type HistoryEntry } from "./history.ts";
import {
  MAX_PLAYERS,
  NAME_MAX,
  addPlayer,
  clampSkill,
  exportPlayers,
  importPlayers,
  normalizeName,
  removePlayer,
  renamePlayer,
  sanitizePlayers,
  setSkill,
  togglePresent,
  type Player,
} from "./players.ts";

test("names are trimmed, whitespace collapsed, and cut to 40 characters", () => {
  assert.equal(normalizeName("  Anna   Lena  "), "Anna Lena");
  assert.equal(normalizeName("x".repeat(60)).length, NAME_MAX);
  assert.equal(normalizeName("Tab\there"), "Tab here");
  assert.equal(normalizeName(42), "");
  assert.equal(normalizeName("   "), "");
});

test("add, rename, remove, skill and presence", () => {
  let players: Player[] = [];
  let r = addPlayer(players, " Mia ", 5, "a");
  assert.ok(r.ok);
  players = r.players;
  assert.deepEqual(players[0], { id: "a", name: "Mia", skill: 5, present: true });
  r = addPlayer(players, "mia");
  assert.deepEqual(r, { ok: false, reason: "duplicate" });
  assert.deepEqual(addPlayer(players, "   "), { ok: false, reason: "empty" });
  r = addPlayer(players, "Ben", 99, "b");
  assert.ok(r.ok);
  players = r.players;
  assert.equal(players[1]!.skill, 10);
  const renamed = renamePlayer(players, "b", "  Benjamin ");
  assert.ok(renamed.ok);
  assert.equal(renamed.players[1]!.name, "Benjamin");
  assert.deepEqual(renamePlayer(players, "b", "MIA"), { ok: false, reason: "duplicate" });
  assert.ok(renamePlayer(players, "a", "MIA").ok, "changing the case of the own name is fine");
  players = setSkill(players, "a", 0);
  assert.equal(players[0]!.skill, 1);
  players = togglePresent(players, "a");
  assert.equal(players[0]!.present, false);
  players = removePlayer(players, "a");
  assert.deepEqual(players.map((p) => p.id), ["b"]);
  assert.equal(clampSkill("7"), 7);
  assert.equal(clampSkill(undefined), 5);
});

test("at most 100 players", () => {
  let players: Player[] = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const r = addPlayer(players, `P${i}`);
    assert.ok(r.ok);
    players = r.players;
  }
  assert.deepEqual(addPlayer(players, "One more"), { ok: false, reason: "full" });
  const many = sanitizePlayers(Array.from({ length: 150 }, (_, i) => ({ name: `N${i}` })));
  assert.equal(many.players.length, 100);
  assert.equal(many.skipped, 50);
});

test("export and import players as JSON", () => {
  const players: Player[] = [
    { id: "a", name: "Mia", skill: 7, present: true },
    { id: "b", name: "Ben", skill: 3, present: false },
  ];
  const json = exportPlayers(players);
  const back = importPlayers(json);
  assert.ok(back.ok);
  assert.deepEqual(back.players.map(({ name, skill, present }) => ({ name, skill, present })), [
    { name: "Mia", skill: 7, present: true },
    { name: "Ben", skill: 3, present: false },
  ]);
  const names = importPlayers('["Ada", " Ada ", "", "Linus"]');
  assert.ok(names.ok);
  assert.deepEqual(names.players.map((p) => p.name), ["Ada", "Linus"]);
  assert.equal(names.skipped, 2);
  assert.deepEqual(importPlayers("{"), { ok: false, reason: "json" });
  assert.deepEqual(importPlayers('{"schema":"other","players":[]}'), { ok: false, reason: "format" });
  assert.deepEqual(importPlayers('{"a":1}'), { ok: false, reason: "format" });
  assert.deepEqual(importPlayers("[1,2]"), { ok: false, reason: "empty" });
});

test("history keeps the newest 50 entries", () => {
  let history: HistoryEntry[] = [];
  for (let i = 0; i < 80; i++) history = addEntry(history, { kind: "roll", at: new Date(2026, 10, 19, 12, 0, i).toISOString(), sides: 6, count: 1, modifier: 0, rolls: [1 + (i % 6)], total: 1 + (i % 6) });
  assert.equal(history.length, HISTORY_MAX);
  assert.equal(HISTORY_MAX, 50);
  assert.equal((history[0] as { rolls: number[] }).rolls[0], 1 + (79 % 6));
  assert.ok(parseEntry(history[0]));
  assert.equal(parseEntry({ kind: "roll", at: "x", sides: 6, count: 1, modifier: 0, rolls: [1], total: 1 }), null);
  assert.equal(parseEntry({ kind: "roll", at: "2026-11-19T11:00:00Z", sides: 6, count: 2, modifier: 0, rolls: [1], total: 1 }), null);
  assert.equal(parseEntry({ kind: "roll", at: "2026-11-19T11:00:00Z", sides: 6, count: 1, modifier: 0, rolls: [7], total: 7 }), null);
  assert.ok(parseEntry({ kind: "teams", at: "2026-11-19T11:00:00Z", mode: "skill", teams: [{ names: ["A"], sum: 5 }], spread: 0 }));
  assert.ok(parseEntry({ kind: "order", at: "2026-11-19T11:00:00Z", names: ["A", "B"], starterOnly: false }));
  assert.equal(parseEntry({ kind: "other", at: "2026-11-19T11:00:00Z" }), null);
});
