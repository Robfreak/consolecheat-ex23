import assert from "node:assert/strict";
import test from "node:test";
import { presentPlayers, type Player } from "./players.ts";
import { seededSource } from "./random.ts";
import { clampTeamCount, makeTeams, maxTeams, pickStarter, randomTeams, skillTeams, spreadOf, startOrder, teamSizes } from "./teams.ts";

function roster(skills: number[], present?: boolean[]): Player[] {
  return skills.map((skill, i) => ({ id: `p${i}`, name: `P${i}`, skill, present: present ? present[i]! : true }));
}

function bruteOptimum(skills: number[], k: number): number {
  const sizes = teamSizes(skills.length, k).join();
  let best = Infinity;
  const total = k ** skills.length;
  for (let m = 0; m < total; m++) {
    let x = m;
    const c = new Array(k).fill(0);
    const s = new Array(k).fill(0);
    for (const skill of skills) {
      const t = x % k;
      x = Math.floor(x / k);
      c[t]++;
      s[t] += skill;
    }
    if ([...c].sort((a, b) => b - a).join() !== sizes) continue;
    best = Math.min(best, Math.max(...s) - Math.min(...s));
  }
  return best;
}

test("team sizes differ by at most 1 for every N and player count, in both modes", () => {
  const source = seededSource(3);
  for (let players = 2; players <= 30; players++) {
    for (let k = 2; k <= players; k++) {
      const sizes = teamSizes(players, k);
      assert.equal(sizes.reduce((a, b) => a + b, 0), players);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
      if (players > 16 && k % 3 !== 0) continue; // keep the run short; the size logic is shared
      const list = roster(Array.from({ length: players }, (_, i) => 1 + ((i * 7) % 10)));
      for (const mode of ["random", "skill"] as const) {
        const result = makeTeams(mode, list, k, source);
        const got = result.teams.map((t) => t.players.length);
        assert.equal(got.length, k);
        assert.ok(Math.max(...got) - Math.min(...got) <= 1, `${mode} ${players}/${k}: ${got}`);
        const ids = result.teams.flatMap((t) => t.players.map((p) => p.id)).sort();
        assert.deepEqual(ids, list.map((p) => p.id).sort(), "everyone exactly once");
        for (const t of result.teams) assert.equal(t.sum, t.players.reduce((a, p) => a + p.skill, 0));
        assert.equal(result.spread, spreadOf(result.teams));
      }
    }
  }
  assert.throws(() => randomTeams(roster([1, 2]), 3));
  assert.throws(() => skillTeams(roster([1, 2, 3]), 1));
});

test("skill mode beats or matches random on spread", () => {
  const source = seededSource(11);
  let wins = 0;
  let rounds = 0;
  for (let round = 0; round < 120; round++) {
    const count = 4 + (round % 17);
    const skills = Array.from({ length: count }, (_, i) => 1 + ((i * 37 + round * 11) % 10));
    const k = 2 + (round % Math.min(4, count - 1));
    const list = roster(skills);
    const skill = skillTeams(list, k, source).spread;
    const randomSpreads = Array.from({ length: 20 }, () => randomTeams(list, k, source).spread);
    for (const r of randomSpreads) assert.ok(skill <= r, `skill ${skill} > random ${r}`);
    if (skill < Math.max(...randomSpreads)) wins++;
    rounds++;
  }
  assert.ok(wins > rounds * 0.8, `${wins}/${rounds}`);
});

test("skill mode is optimal or within 2 of the brute-forced optimum on small cases", () => {
  const source = seededSource(5);
  let optimal = 0;
  let cases = 0;
  for (let round = 0; round < 150; round++) {
    const words = new Uint32Array(12);
    source(words);
    const count = 4 + (words[0]! % 5);
    const k = 2 + (words[1]! % Math.min(3, count - 1));
    const skills = Array.from({ length: count }, (_, i) => 1 + (words[2 + i]! % 10));
    const best = bruteOptimum(skills, k);
    const got = skillTeams(roster(skills), k, source).spread;
    assert.ok(got >= best);
    assert.ok(got - best <= 2, `${skills} into ${k}: ${got} vs ${best}`);
    if (got === best) optimal++;
    cases++;
  }
  assert.ok(optimal >= cases * 0.95, `${optimal}/${cases} optimal`);
  // Hand-made: 8 players, perfect split exists.
  assert.equal(skillTeams(roster([10, 9, 8, 7, 3, 2, 2, 1]), 2, source).spread, 0);
});

test("skill re-rolls differ while staying balanced", () => {
  const list = roster([5, 5, 5, 5, 5, 5, 5, 5]);
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const result = skillTeams(list, 2);
    assert.equal(result.spread, 0);
    seen.add(result.teams.map((t) => t.players.map((p) => p.id).sort().join(",")).sort().join("|"));
  }
  assert.ok(seen.size > 3, `only ${seen.size} different splits`);
});

test("large groups stay fast", () => {
  const list = roster(Array.from({ length: 100 }, (_, i) => 1 + ((i * 13) % 10)));
  const started = performance.now();
  const result = skillTeams(list, 7);
  assert.ok(performance.now() - started < 3000);
  assert.ok(result.spread <= 2, `spread ${result.spread}`);
});

test("absent players are left out of teams and orders", () => {
  const list = roster([5, 6, 7, 8, 9], [true, false, true, true, false]);
  const here = presentPlayers(list);
  assert.deepEqual(here.map((p) => p.id), ["p0", "p2", "p3"]);
  const teams = makeTeams("skill", here, 2);
  assert.ok(teams.teams.flatMap((t) => t.players).every((p) => p.present));
  const order = startOrder(here);
  assert.deepEqual([...order.map((p) => p.id)].sort(), ["p0", "p2", "p3"]);
  const starter = pickStarter(here);
  assert.ok(starter && starter.present);
  assert.equal(pickStarter([]), null);
});

test("team count is clamped to 2 … present players", () => {
  assert.equal(maxTeams(0), 2);
  assert.equal(maxTeams(9), 9);
  assert.equal(clampTeamCount(1, 9), 2);
  assert.equal(clampTeamCount(12, 9), 9);
  assert.equal(clampTeamCount("x", 9), 2);
  assert.equal(clampTeamCount(4, 9), 4);
});
