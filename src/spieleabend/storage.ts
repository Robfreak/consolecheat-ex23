import { COUNT_MAX, COUNT_MIN, MOD_MAX, MOD_MIN, SIDES_MAX, SIDES_MIN } from "./dice.ts";
import { HISTORY_MAX, parseEntry, type HistoryEntry } from "./history.ts";
import { sanitizePlayers, type Player } from "./players.ts";

// One key for players, settings and history. Nothing else is written except language and theme.

export const STORE_KEY = "consolecheat-spieleabend-v1";
export const LANG_KEY = "consolecheat-lang";
export const THEME_KEY = "consolecheat-theme";
export const SCHEMA = "consolecheat-spieleabend";
export const VERSION = 1;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type Tab = "dice" | "teams" | "order";
export const TABS: readonly Tab[] = ["dice", "teams", "order"];
export type Settings = { sides: number; count: number; modifier: number; teamCount: number; teamMode: "random" | "skill"; starterOnly: boolean; tab: Tab };
export type Store = { players: Player[]; settings: Settings; history: HistoryEntry[] };
export type LoadResult = { store: Store; corrupt: boolean };

export function defaultSettings(): Settings {
  return { sides: 6, count: 1, modifier: 0, teamCount: 2, teamMode: "skill", starterOnly: false, tab: "dice" };
}

export function emptyStore(): Store {
  return { players: [], settings: defaultSettings(), history: [] };
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function intIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function parseSettings(value: unknown): { settings: Settings; bad: boolean } {
  const settings = defaultSettings();
  if (value === undefined) return { settings, bad: false };
  if (!plain(value)) return { settings, bad: true };
  let bad = false;
  const take = <K extends keyof Settings>(key: K, ok: (v: unknown) => boolean) => {
    if (value[key] === undefined) return;
    if (ok(value[key])) settings[key] = value[key] as Settings[K];
    else bad = true;
  };
  take("sides", (v) => intIn(v, SIDES_MIN, SIDES_MAX));
  take("count", (v) => intIn(v, COUNT_MIN, COUNT_MAX));
  take("modifier", (v) => intIn(v, MOD_MIN, MOD_MAX));
  take("teamCount", (v) => intIn(v, 2, 100));
  take("teamMode", (v) => v === "random" || v === "skill");
  take("starterOnly", (v) => typeof v === "boolean");
  take("tab", (v) => TABS.includes(v as Tab));
  return { settings, bad };
}

/** Never throws. Broken JSON or another schema/version: empty store, flagged. Bad parts are skipped. */
export function parseStore(raw: string | null): LoadResult {
  if (raw === null) return { store: emptyStore(), corrupt: false };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { store: emptyStore(), corrupt: true };
  }
  if (!plain(data) || data.schema !== SCHEMA || data.version !== VERSION) return { store: emptyStore(), corrupt: true };
  let corrupt = false;
  const { players, skipped } = sanitizePlayers(data.players);
  if (skipped > 0 || (data.players !== undefined && !Array.isArray(data.players))) corrupt = true;
  const { settings, bad } = parseSettings(data.settings);
  if (bad) corrupt = true;
  const history: HistoryEntry[] = [];
  if (Array.isArray(data.history)) {
    for (const item of data.history.slice(0, HISTORY_MAX)) {
      const entry = parseEntry(item);
      if (entry) history.push(entry);
      else corrupt = true;
    }
  } else if (data.history !== undefined) corrupt = true;
  return { store: { players, settings, history }, corrupt };
}

export function serializeStore(store: Store): string {
  return JSON.stringify({ schema: SCHEMA, version: VERSION, players: store.players, settings: store.settings, history: store.history.slice(0, HISTORY_MAX) });
}

export function loadStore(local: StorageLike): LoadResult {
  try {
    return parseStore(local.getItem(STORE_KEY));
  } catch {
    return { store: emptyStore(), corrupt: false };
  }
}

/** Writes only STORE_KEY. */
export function saveStore(local: StorageLike, store: Store): boolean {
  try {
    local.setItem(STORE_KEY, serializeStore(store));
    return true;
  } catch {
    return false;
  }
}

/** Removes only this tool's key; language, theme and other tools' data stay. */
export function resetStore(local: StorageLike): boolean {
  try {
    local.removeItem(STORE_KEY);
    return true;
  } catch {
    return false;
  }
}
