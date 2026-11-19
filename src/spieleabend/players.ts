export const MAX_PLAYERS = 100;
export const NAME_MAX = 40;
export const SKILL_MIN = 1;
export const SKILL_MAX = 10;
export const SKILL_DEFAULT = 5;

export type Player = { id: string; name: string; skill: number; present: boolean };

/** Trimmed, inner whitespace collapsed, at most 40 characters. */
export function normalizeName(value: unknown): string {
  if (typeof value !== "string") return "";
  return [...value.replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim()].slice(0, NAME_MAX).join("").trim();
}

export function clampSkill(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return SKILL_DEFAULT;
  return Math.min(SKILL_MAX, Math.max(SKILL_MIN, Math.round(n)));
}

let counter = 0;
export function newId(): string {
  counter = (counter + 1) % 1_000_000;
  return `p${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export type AddResult = { ok: true; players: Player[] } | { ok: false; reason: "empty" | "duplicate" | "full" };

function taken(players: readonly Player[], name: string, except?: string): boolean {
  const key = name.toLocaleLowerCase();
  return players.some((p) => p.id !== except && p.name.toLocaleLowerCase() === key);
}

export function addPlayer(players: readonly Player[], rawName: string, skill: unknown = SKILL_DEFAULT, id = newId()): AddResult {
  const name = normalizeName(rawName);
  if (!name) return { ok: false, reason: "empty" };
  if (players.length >= MAX_PLAYERS) return { ok: false, reason: "full" };
  if (taken(players, name)) return { ok: false, reason: "duplicate" };
  return { ok: true, players: [...players, { id, name, skill: clampSkill(skill), present: true }] };
}

export function renamePlayer(players: readonly Player[], id: string, rawName: string): AddResult {
  const name = normalizeName(rawName);
  if (!name) return { ok: false, reason: "empty" };
  if (taken(players, name, id)) return { ok: false, reason: "duplicate" };
  return { ok: true, players: players.map((p) => (p.id === id ? { ...p, name } : p)) };
}

export function removePlayer(players: readonly Player[], id: string): Player[] {
  return players.filter((p) => p.id !== id);
}

export function setSkill(players: readonly Player[], id: string, skill: unknown): Player[] {
  return players.map((p) => (p.id === id ? { ...p, skill: clampSkill(skill) } : p));
}

export function togglePresent(players: readonly Player[], id: string): Player[] {
  return players.map((p) => (p.id === id ? { ...p, present: !p.present } : p));
}

export function presentPlayers(players: readonly Player[]): Player[] {
  return players.filter((p) => p.present);
}

/** Cleans a list from storage or an import: valid entries only, unique names, at most 100. */
export function sanitizePlayers(value: unknown): { players: Player[]; skipped: number } {
  if (!Array.isArray(value)) return { players: [], skipped: 0 };
  const players: Player[] = [];
  let skipped = 0;
  const ids = new Set<string>();
  for (const item of value) {
    const raw = typeof item === "string" ? { name: item } : item;
    if (!raw || typeof raw !== "object") {
      skipped++;
      continue;
    }
    const record = raw as Record<string, unknown>;
    const name = normalizeName(record.name);
    if (!name || players.length >= MAX_PLAYERS || taken(players, name)) {
      skipped++;
      continue;
    }
    let id = typeof record.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(record.id) ? record.id : newId();
    while (ids.has(id)) id = newId();
    ids.add(id);
    players.push({ id, name, skill: clampSkill(record.skill ?? SKILL_DEFAULT), present: record.present !== false });
  }
  return { players, skipped };
}

export const EXPORT_SCHEMA = "consolecheat-spieleabend-players";

export function exportPlayers(players: readonly Player[]): string {
  return JSON.stringify({ schema: EXPORT_SCHEMA, version: 1, players: players.map(({ name, skill, present }) => ({ name, skill, present })) }, null, 2);
}

export type ImportResult = { ok: true; players: Player[]; skipped: number } | { ok: false; reason: "json" | "format" | "empty" };

/** Accepts the export format, a bare array of players, or a bare array of names. */
export function importPlayers(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "json" };
  }
  let list: unknown;
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).players)) {
    const record = data as Record<string, unknown>;
    if (record.schema !== undefined && record.schema !== EXPORT_SCHEMA) return { ok: false, reason: "format" };
    list = record.players;
  } else return { ok: false, reason: "format" };
  const { players, skipped } = sanitizePlayers(list);
  if (players.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, players, skipped };
}
