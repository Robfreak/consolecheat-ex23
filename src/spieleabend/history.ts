export const HISTORY_MAX = 50;

export type RollEntry = { kind: "roll"; at: string; sides: number; count: number; modifier: number; rolls: number[]; total: number };
export type TeamsEntry = { kind: "teams"; at: string; mode: "random" | "skill"; teams: { names: string[]; sum: number }[]; spread: number };
export type OrderEntry = { kind: "order"; at: string; names: string[]; starterOnly: boolean };
export type HistoryEntry = RollEntry | TeamsEntry | OrderEntry;

/** Newest first, at most 50. */
export function addEntry(history: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...history].slice(0, HISTORY_MAX);
}

function int(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function names(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every((n) => typeof n === "string" && n.length <= 40);
}

export function parseEntry(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  if (typeof e.at !== "string" || Number.isNaN(Date.parse(e.at))) return null;
  if (e.kind === "roll") {
    if (!int(e.sides, 2, 1000) || !int(e.count, 1, 20) || !int(e.modifier, -100, 100) || !int(e.total, -100, 20100)) return null;
    if (!Array.isArray(e.rolls) || e.rolls.length !== e.count || !e.rolls.every((r) => int(r, 1, e.sides as number))) return null;
    return { kind: "roll", at: e.at, sides: e.sides, count: e.count, modifier: e.modifier, rolls: e.rolls as number[], total: e.total };
  }
  if (e.kind === "teams") {
    if ((e.mode !== "random" && e.mode !== "skill") || !int(e.spread, 0, 1000) || !Array.isArray(e.teams) || e.teams.length > 100) return null;
    const teams: { names: string[]; sum: number }[] = [];
    for (const t of e.teams) {
      if (!t || typeof t !== "object") return null;
      const r = t as Record<string, unknown>;
      if (!names(r.names, 100) || !int(r.sum, 0, 1000)) return null;
      teams.push({ names: r.names, sum: r.sum });
    }
    return { kind: "teams", at: e.at, mode: e.mode, teams, spread: e.spread };
  }
  if (e.kind === "order") {
    if (!names(e.names, 100)) return null;
    return { kind: "order", at: e.at, names: e.names, starterOnly: e.starterOnly === true };
  }
  return null;
}
