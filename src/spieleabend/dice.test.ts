import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DIE_TYPES, clampCount, clampModifier, clampSides, notation, rollDice, stepDie, totalRange } from "./dice.ts";
import { cryptoSource, randomInt, rejectionLimit, seededSource, shuffle, type RandomSource } from "./random.ts";

test("every face of every die comes up within tolerance of the mean (crypto source)", () => {
  for (const sides of [...DIE_TYPES, 3, 7, 100]) {
    const rolls = sides * 4000;
    const counts = new Array(sides + 1).fill(0);
    for (let i = 0; i < rolls; i++) counts[randomInt(sides) + 1]++;
    assert.equal(counts[0], 0);
    const expected = rolls / sides;
    const sd = Math.sqrt(expected * (1 - 1 / sides));
    let chi = 0;
    for (let f = 1; f <= sides; f++) {
      assert.ok(Math.abs(counts[f] - expected) < 6 * sd, `D${sides} face ${f}: ${counts[f]} vs ${expected}`);
      chi += (counts[f] - expected) ** 2 / expected;
    }
    // Chi-square: mean sides-1, sd sqrt(2(sides-1)); 6 sd is far beyond chance.
    assert.ok(chi < sides - 1 + 6 * Math.sqrt(2 * (sides - 1)), `D${sides} chi² ${chi.toFixed(1)}`);
  }
});

test("rejection sampling throws away the biased top block of 2^32", () => {
  assert.equal(rejectionLimit(6), 4294967292);
  assert.equal(rejectionLimit(2), 4294967296);
  assert.equal(rejectionLimit(1000), 4294967000);
  // A source that first returns values in the rejected block, then a good one.
  const queue = [4294967295, 4294967293, 4294967292, 13];
  const calls: number[] = [];
  const fake: RandomSource = (out) => {
    out[0] = queue.shift()!;
    calls.push(out[0]);
    return out;
  };
  assert.equal(randomInt(6, fake), 13 % 6);
  assert.equal(calls.length, 4, "three draws rejected before the accepted one");
  // With a uniform source over a tiny range the result is exactly uniform: emulate 2^32 = 6k+4 blocks.
  const stuck: RandomSource = (out) => {
    out[0] = 4294967295;
    return out;
  };
  assert.throws(() => randomInt(6, stuck));
  assert.equal(randomInt(1, stuck), 0);
  assert.throws(() => randomInt(0));
  // The code uses crypto.getRandomValues, not Math.random.
  const src = readFileSync(new URL("./random.ts", import.meta.url), "utf8");
  assert.match(src, /crypto\.getRandomValues/);
  for (const name of ["random.ts", "dice.ts", "teams.ts"]) assert.doesNotMatch(readFileSync(new URL(`./${name}`, import.meta.url), "utf8"), /Math\.random/, name);
  assert.ok(cryptoSource(new Uint32Array(2)).length === 2);
});

test("custom sides, count and modifier are clamped", () => {
  assert.equal(clampSides(1), 2);
  assert.equal(clampSides(5000), 1000);
  assert.equal(clampSides(37.4), 37);
  assert.equal(clampSides("abc"), 6);
  assert.equal(clampSides(""), 6);
  assert.equal(clampCount(0), 1);
  assert.equal(clampCount(99), 20);
  assert.equal(clampModifier(-500), -100);
  assert.equal(clampModifier(250), 100);
  const roll = rollDice({ sides: 99999, count: 50, modifier: 7 }, seededSource(1));
  assert.equal(roll.sides, 1000);
  assert.equal(roll.count, 20);
  assert.equal(roll.rolls.length, 20);
  assert.ok(roll.rolls.every((r) => r >= 1 && r <= 1000));
});

test("sum, modifier, min and max", () => {
  const source = seededSource(42);
  for (let i = 0; i < 500; i++) {
    const spec = { sides: 2 + (i % 30), count: 1 + (i % 20), modifier: (i % 21) - 10 };
    const roll = rollDice(spec, source);
    assert.equal(roll.rolls.length, spec.count);
    assert.equal(roll.sum, roll.rolls.reduce((a, b) => a + b, 0));
    assert.equal(roll.total, roll.sum + spec.modifier);
    assert.equal(roll.min, Math.min(...roll.rolls));
    assert.equal(roll.max, Math.max(...roll.rolls));
    const range = totalRange(spec);
    assert.ok(roll.total >= range.low && roll.total <= range.high);
  }
  assert.equal(notation({ sides: 6, count: 3, modifier: 2 }, "de"), "3W6+2");
  assert.equal(notation({ sides: 20, count: 1, modifier: -1 }, "en"), "1d20−1");
  assert.equal(notation({ sides: 8, count: 2, modifier: 0 }, "en"), "2d8");
  assert.deepEqual(totalRange({ sides: 6, count: 2, modifier: 1 }), { low: 3, high: 13 });
});

test("the die list steps up and down; custom sides snap to the next step", () => {
  assert.equal(stepDie(6, 1), 8);
  assert.equal(stepDie(6, -1), 4);
  assert.equal(stepDie(20, 1), 20);
  assert.equal(stepDie(4, -1), 4);
  assert.equal(stepDie(7, 1), 8);
  assert.equal(stepDie(7, -1), 6);
  assert.equal(stepDie(100, 1), 20);
  assert.equal(stepDie(2, -1), 4);
});

test("Fisher–Yates returns a permutation, and all orders of 3 are about equally likely", () => {
  const items = Array.from({ length: 30 }, (_, i) => i);
  const source = seededSource(9);
  for (let round = 0; round < 50; round++) {
    const out = shuffle(items, source);
    assert.equal(out.length, items.length);
    assert.deepEqual([...out].sort((a, b) => a - b), items);
  }
  assert.deepEqual(items[0], 0, "input untouched");
  const counts = new Map<string, number>();
  const n = 60000;
  for (let i = 0; i < n; i++) {
    const key = shuffle(["a", "b", "c"]).join("");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 6);
  for (const [key, c] of counts) assert.ok(Math.abs(c - n / 6) < 6 * Math.sqrt((n / 6) * (5 / 6)), `${key}: ${c}`);
  assert.deepEqual(shuffle([]), []);
});
