// Keyboard and gamepad mapping. Pure helpers so node:test can check them.

export type Action =
  | { type: "roll" }
  | { type: "teams" }
  | { type: "order" }
  | { type: "run" }
  | { type: "reroll" }
  | { type: "tab"; step: 1 | -1 }
  | { type: "die"; step: 1 | -1 }
  | { type: "count"; step: 1 | -1 };

export type KeyLike = { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean };
export type TargetLike = { tagName?: string; type?: string; isContentEditable?: boolean; role?: string | null } | null;

const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", "number", "range", "date", "time"]);

/** Text fields, number inputs, selects, text areas and editable content keep every key. */
export function isTypingTarget(target: TargetLike): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUTS.has((target.type ?? "text").toLowerCase());
  return false;
}

/** Elements where Space already means "press me". */
function activatesOnSpace(target: TargetLike): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY") return true;
  if (tag === "INPUT") return true;
  return target.role === "button" || target.role === "tab" || target.role === "checkbox";
}

/** R or Space rolls, T makes teams, O makes an order. Off in typing targets; Space only where it would do nothing else. */
export function keyAction(event: KeyLike, target: TargetLike): Action | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTypingTarget(target)) return null;
  switch (event.key) {
    case "r":
    case "R":
      return { type: "roll" };
    case " ":
      return activatesOnSpace(target) ? null : { type: "roll" };
    case "t":
    case "T":
      return { type: "teams" };
    case "o":
    case "O":
      return { type: "order" };
    default:
      return null;
  }
}

// Standard gamepad mapping (PlayStation labels).
export const PAD = { cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, up: 12, down: 13, left: 14, right: 15 } as const;

const BUTTON_ACTIONS: readonly (readonly [number, Action])[] = [
  [PAD.cross, { type: "run" }],
  [PAD.triangle, { type: "reroll" }],
  [PAD.l1, { type: "tab", step: -1 }],
  [PAD.r1, { type: "tab", step: 1 }],
  [PAD.up, { type: "die", step: 1 }],
  [PAD.down, { type: "die", step: -1 }],
  [PAD.left, { type: "count", step: -1 }],
  [PAD.right, { type: "count", step: 1 }],
];
const WATCHED = BUTTON_ACTIONS.map(([index]) => index);

export type PadLike = { index: number; id?: string; buttons: readonly { pressed: boolean }[] };
export type PadMemory = { id: string; buttons: boolean[] };

function snapshot(pad: PadLike): PadMemory {
  const buttons: boolean[] = [];
  for (const index of WATCHED) buttons[index] = Boolean(pad.buttons[index]?.pressed);
  return { id: pad.id ?? "", buttons };
}

/**
 * One pad, one poll (the pollPad pattern of ex15). No memory, or a different pad at this
 * index (other id): seed and emit nothing. Blocked (a field has focus): the memory follows
 * the pad and nothing fires, then or later while held.
 */
export function pollPad(pad: PadLike | null, memory: PadMemory | null, blocked = false): { actions: Action[]; memory: PadMemory | null } {
  if (!pad) return { actions: [], memory: null };
  const seeded = snapshot(pad);
  if (!memory || memory.id !== seeded.id || blocked) return { actions: [], memory: seeded };
  const actions: Action[] = [];
  for (const [index, action] of BUTTON_ACTIONS) if (seeded.buttons[index] && !memory.buttons[index]) actions.push(action);
  return { actions, memory: seeded };
}

/** Memory per gamepad index. A pad missing from a poll, or forgotten on disconnect, seeds again. */
export function createPadPoller() {
  const memories = new Map<number, PadMemory>();
  return {
    poll(pads: readonly (PadLike | null)[], blocked = false): Action[] {
      const actions: Action[] = [];
      const live = new Set<number>();
      for (const pad of pads) {
        if (!pad) continue;
        live.add(pad.index);
        const result = pollPad(pad, memories.get(pad.index) ?? null, blocked);
        if (result.memory) memories.set(pad.index, result.memory);
        actions.push(...result.actions);
      }
      for (const index of [...memories.keys()]) if (!live.has(index)) memories.delete(index);
      return actions;
    },
    forget(index: number) {
      memories.delete(index);
    },
  };
}

export function stepTab<T>(tabs: readonly T[], current: T, step: 1 | -1): T {
  const index = Math.max(0, tabs.indexOf(current));
  return tabs[(index + step + tabs.length) % tabs.length]!;
}
