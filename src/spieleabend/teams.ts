import type { Player } from "./players.ts";
import { cryptoSource, randomInt, shuffle, type RandomSource } from "./random.ts";

export type TeamMode = "random" | "skill";
export type Team = { players: Player[]; sum: number };
export type TeamResult = { mode: TeamMode; teams: Team[]; spread: number };

export const TEAMS_MIN = 2;

/** Sizes for `players` split into `k` teams: they differ by at most 1, larger teams first. */
export function teamSizes(players: number, k: number): number[] {
  const base = Math.floor(players / k);
  const extra = players % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/** 2 … number of present players (at least 2 players needed). */
export function maxTeams(present: number): number {
  return Math.max(TEAMS_MIN, present);
}

export function clampTeamCount(value: unknown, present: number): number {
  const n = typeof value === "number" ? value : Number(value);
  const max = maxTeams(present);
  if (!Number.isFinite(n)) return TEAMS_MIN;
  return Math.min(max, Math.max(TEAMS_MIN, Math.round(n)));
}

export function teamSum(team: readonly Player[]): number {
  return team.reduce((a, p) => a + p.skill, 0);
}

export function spreadOf(teams: readonly { sum: number }[]): number {
  if (teams.length === 0) return 0;
  const sums = teams.map((t) => t.sum);
  return Math.max(...sums) - Math.min(...sums);
}

function finish(mode: TeamMode, groups: Player[][]): TeamResult {
  const teams = groups.map((players) => ({ players, sum: teamSum(players) }));
  return { mode, teams, spread: spreadOf(teams) };
}

function validate(players: readonly Player[], k: number) {
  if (!Number.isInteger(k) || k < TEAMS_MIN) throw new RangeError("at least 2 teams");
  if (players.length < k) throw new RangeError("fewer players than teams");
}

/** Random: Fisher–Yates shuffle, then deal into the sizes (which teams get the extra player is random too). */
export function randomTeams(players: readonly Player[], k: number, source: RandomSource = cryptoSource): TeamResult {
  validate(players, k);
  const order = shuffle(players, source);
  const sizes = shuffle(teamSizes(players.length, k), source);
  const groups: Player[][] = [];
  let at = 0;
  for (const size of sizes) {
    groups.push(order.slice(at, at + size));
    at += size;
  }
  return finish("random", groups);
}

// Lexicographic score: spread first, then the sum of squared deviations from the mean.
function score(sums: readonly number[]): [number, number] {
  const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
  return [Math.max(...sums) - Math.min(...sums), sums.reduce((a, s) => a + (s - mean) ** 2, 0)];
}

function better(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1] - 1e-9);
}

function improve(groups: Player[][], sums: number[], source: RandomSource, maxPasses: number): void {
  const k = groups.length;
  for (let pass = 0; pass < maxPasses; pass++) {
    const pairs: [number, number, number, number][] = [];
    for (let a = 0; a < k; a++)
      for (let b = a + 1; b < k; b++)
        for (let i = 0; i < groups[a]!.length; i++) for (let j = 0; j < groups[b]!.length; j++) pairs.push([a, i, b, j]);
    let improved = false;
    const current = score(sums);
    for (const [a, i, b, j] of shuffle(pairs, source)) {
      const pa = groups[a]![i]!;
      const pb = groups[b]![j]!;
      const delta = pb.skill - pa.skill;
      if (delta === 0) continue;
      const next = [...sums];
      next[a]! += delta;
      next[b]! -= delta;
      if (better(score(next), current)) {
        groups[a]![i] = pb;
        groups[b]![j] = pa;
        sums[a] = next[a]!;
        sums[b] = next[b]!;
        improved = true;
        break;
      }
    }
    if (!improved) return;
  }
}

function greedy(players: readonly Player[], k: number, source: RandomSource, randomStart: boolean): { groups: Player[][]; sums: number[] } {
  const capacity = shuffle(teamSizes(players.length, k), source);
  const ordered = randomStart ? shuffle(players, source) : shuffle(players, source).sort((a, b) => b.skill - a.skill);
  const groups: Player[][] = Array.from({ length: k }, () => []);
  const sums = new Array<number>(k).fill(0);
  for (const player of ordered) {
    let best: number[] = [];
    for (let t = 0; t < k; t++) {
      if (groups[t]!.length >= capacity[t]!) continue;
      if (best.length === 0 || sums[t]! < sums[best[0]!]!) best = [t];
      else if (sums[t] === sums[best[0]!]) best.push(t);
    }
    const pick = best[randomInt(best.length, source)]!;
    groups[pick]!.push(player);
    sums[pick]! += player.skill;
  }
  return { groups, sums };
}

/**
 * Skill-weighted: greedy pass (strongest first, each to the team with the lowest sum
 * that still has room; ties broken at random), then swap improvement: swap two players
 * of different teams while that lowers the spread (or, at equal spread, the variance).
 * A few extra restarts from a random greedy order escape local optima; the best result
 * wins. Pairs and ties are tried in random order, so re-rolls give different but
 * equally fair teams.
 */
export function skillTeams(players: readonly Player[], k: number, source: RandomSource = cryptoSource, restarts?: number): TeamResult {
  validate(players, k);
  const tries = restarts ?? (players.length <= 24 ? 12 : players.length <= 60 ? 5 : 2);
  let best: { groups: Player[][]; sums: number[] } | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    const candidate = greedy(players, k, source, attempt > 0);
    improve(candidate.groups, candidate.sums, source, 400);
    if (!best || better(score(candidate.sums), score(best.sums))) best = candidate;
    if (score(best.sums)[0] === 0) break;
  }
  return finish("skill", best!.groups);
}

export function makeTeams(mode: TeamMode, players: readonly Player[], k: number, source: RandomSource = cryptoSource): TeamResult {
  return mode === "skill" ? skillTeams(players, k, source) : randomTeams(players, k, source);
}

/** Start order: Fisher–Yates over the present players. */
export function startOrder(players: readonly Player[], source: RandomSource = cryptoSource): Player[] {
  return shuffle(players, source);
}

export function pickStarter(players: readonly Player[], source: RandomSource = cryptoSource): Player | null {
  if (players.length === 0) return null;
  return players[randomInt(players.length, source)]!;
}
