import { cryptoSource, randomInt, type RandomSource } from "./random.ts";

export const DIE_TYPES = [4, 6, 8, 10, 12, 20] as const;
export const SIDES_MIN = 2;
export const SIDES_MAX = 1000;
export const COUNT_MIN = 1;
export const COUNT_MAX = 20;
export const MOD_MIN = -100;
export const MOD_MAX = 100;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const clampSides = (value: unknown) => clampInt(value, SIDES_MIN, SIDES_MAX, 6);
export const clampCount = (value: unknown) => clampInt(value, COUNT_MIN, COUNT_MAX, 1);
export const clampModifier = (value: unknown) => clampInt(value, MOD_MIN, MOD_MAX, 0);

export type DiceSpec = { sides: number; count: number; modifier: number };
export type DiceRoll = DiceSpec & { rolls: number[]; sum: number; total: number; min: number; max: number };

/** Rolls `count` dice with `sides` faces (1…sides each), then adds the modifier to the sum. */
export function rollDice(spec: DiceSpec, source: RandomSource = cryptoSource): DiceRoll {
  const sides = clampSides(spec.sides);
  const count = clampCount(spec.count);
  const modifier = clampModifier(spec.modifier);
  const rolls = Array.from({ length: count }, () => randomInt(sides, source) + 1);
  const sum = rolls.reduce((a, b) => a + b, 0);
  return { sides, count, modifier, rolls, sum, total: sum + modifier, min: Math.min(...rolls), max: Math.max(...rolls) };
}

/** "3W6+2" / "3d6+2". */
export function notation(spec: DiceSpec, lang: "de" | "en"): string {
  const d = lang === "de" ? "W" : "d";
  const mod = spec.modifier > 0 ? `+${spec.modifier}` : spec.modifier < 0 ? `−${Math.abs(spec.modifier)}` : "";
  return `${spec.count}${d}${spec.sides}${mod}`;
}

/** Lowest and highest possible total. */
export function totalRange(spec: DiceSpec): { low: number; high: number } {
  return { low: spec.count + spec.modifier, high: spec.count * spec.sides + spec.modifier };
}

/** Next/previous die in the D4…D20 list (custom sides snap to the nearest step). */
export function stepDie(sides: number, direction: 1 | -1): number {
  const list = DIE_TYPES as readonly number[];
  const index = list.indexOf(sides);
  if (index >= 0) return list[Math.min(list.length - 1, Math.max(0, index + direction))]!;
  if (direction > 0) return list.find((s) => s > sides) ?? list[list.length - 1]!;
  return [...list].reverse().find((s) => s < sides) ?? list[0]!;
}
