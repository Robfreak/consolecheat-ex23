import assert from "node:assert/strict";
import test from "node:test";
import { PAD, createPadPoller, isTypingTarget, keyAction, pollPad, stepTab, type PadLike } from "./input.ts";

function pad(index: number, pressed: number[] = [], id = "pad-a"): PadLike {
  return { index, id, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) };
}

const body = { tagName: "BODY" };

test("R or Space rolls, T makes teams, O makes an order", () => {
  assert.deepEqual(keyAction({ key: "r" }, body), { type: "roll" });
  assert.deepEqual(keyAction({ key: "R" }, body), { type: "roll" });
  assert.deepEqual(keyAction({ key: " " }, body), { type: "roll" });
  assert.deepEqual(keyAction({ key: "t" }, body), { type: "teams" });
  assert.deepEqual(keyAction({ key: "O" }, body), { type: "order" });
  assert.equal(keyAction({ key: "x" }, body), null);
  assert.equal(keyAction({ key: "r", ctrlKey: true }, body), null, "Ctrl+R stays the browser's reload");
  assert.equal(keyAction({ key: "t", metaKey: true }, body), null);
});

test("shortcuts are off in text fields, number inputs, selects and editable content", () => {
  const guarded = [
    { tagName: "INPUT", type: "text" },
    { tagName: "INPUT", type: "number" },
    { tagName: "INPUT", type: "search" },
    { tagName: "SELECT" },
    { tagName: "TEXTAREA" },
    { tagName: "DIV", isContentEditable: true },
  ];
  for (const target of guarded) {
    assert.ok(isTypingTarget(target));
    for (const key of ["r", " ", "t", "o"]) assert.equal(keyAction({ key }, target), null, `${key} in ${target.tagName}`);
  }
  // Space keeps its native meaning on buttons, links, checkboxes and tabs; letters still work there.
  for (const target of [{ tagName: "BUTTON" }, { tagName: "A" }, { tagName: "INPUT", type: "checkbox" }, { tagName: "DIV", role: "tab" }]) {
    assert.equal(keyAction({ key: " " }, target), null);
    assert.deepEqual(keyAction({ key: "r" }, target), { type: "roll" });
  }
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "checkbox" }), false);
  assert.equal(isTypingTarget(null), false);
});

test("the first poll only initialises, so a held button does not fire", () => {
  const first = pollPad(pad(0, [PAD.cross]), null);
  assert.deepEqual(first.actions, []);
  assert.deepEqual(pollPad(pad(0, [PAD.cross]), first.memory).actions, []);
  const released = pollPad(pad(0), first.memory);
  assert.deepEqual(pollPad(pad(0, [PAD.cross]), released.memory).actions, [{ type: "run" }]);
  assert.deepEqual(pollPad(null, released.memory), { actions: [], memory: null });
});

test("gamepad mapping: × run, △ re-roll, L1/R1 tabs, D-pad die and count", () => {
  const cases: [number, object][] = [
    [PAD.cross, { type: "run" }],
    [PAD.triangle, { type: "reroll" }],
    [PAD.l1, { type: "tab", step: -1 }],
    [PAD.r1, { type: "tab", step: 1 }],
    [PAD.up, { type: "die", step: 1 }],
    [PAD.down, { type: "die", step: -1 }],
    [PAD.left, { type: "count", step: -1 }],
    [PAD.right, { type: "count", step: 1 }],
  ];
  assert.deepEqual([PAD.cross, PAD.triangle, PAD.l1, PAD.r1, PAD.up, PAD.down, PAD.left, PAD.right], [0, 3, 4, 5, 12, 13, 14, 15]);
  for (const [button, action] of cases) {
    const seed = pollPad(pad(0), null).memory;
    assert.deepEqual(pollPad(pad(0, [button]), seed).actions, [action], String(button));
  }
  const seed = pollPad(pad(0), null).memory;
  assert.deepEqual(pollPad(pad(0, [PAD.circle, PAD.square]), seed).actions, [], "○ and □ are unused");
});

test("reconnects, pad changes and blocked polls only initialise", () => {
  const poller = createPadPoller();
  assert.deepEqual(poller.poll([pad(0, [PAD.triangle])]), []);
  assert.deepEqual(poller.poll([pad(0)]), []);
  assert.deepEqual(poller.poll([pad(0, [PAD.triangle])]), [{ type: "reroll" }]);
  // A different controller at the same index while a button is held: seed only.
  assert.deepEqual(poller.poll([pad(0, [PAD.triangle, PAD.cross], "pad-b")]), []);
  assert.deepEqual(poller.poll([pad(0, [PAD.cross], "pad-b")]), []);
  // Disconnect and reconnect holding ×.
  poller.forget(0);
  assert.deepEqual(poller.poll([pad(0, [PAD.cross], "pad-b")]), []);
  // Missing from a poll: seeds again.
  assert.deepEqual(poller.poll([null]), []);
  assert.deepEqual(poller.poll([pad(0, [PAD.cross], "pad-b")]), []);
  // Blocked (text field focused): nothing, also not later while held.
  assert.deepEqual(poller.poll([pad(0, [PAD.cross, PAD.r1], "pad-b")], true), []);
  assert.deepEqual(poller.poll([pad(0, [PAD.cross, PAD.r1], "pad-b")]), []);
  assert.deepEqual(poller.poll([pad(0, [], "pad-b"), pad(1, [PAD.l1])]), []);
  assert.deepEqual(poller.poll([pad(0, [PAD.right], "pad-b"), pad(1, [PAD.l1])]), [{ type: "count", step: 1 }]);
});

test("tabs wrap around", () => {
  const tabs = ["dice", "teams", "order"] as const;
  assert.equal(stepTab(tabs, "dice", 1), "teams");
  assert.equal(stepTab(tabs, "order", 1), "dice");
  assert.equal(stepTab(tabs, "dice", -1), "order");
});
