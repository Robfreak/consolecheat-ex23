import { notation, type DiceRoll } from "./dice.ts";
import { fill, type Copy, type Lang } from "./messages.ts";
import type { TeamResult } from "./teams.ts";

export function rollText(roll: DiceRoll, text: Copy, lang: Lang): string {
  return fill(text.rollResult, { notation: notation(roll, lang), rolls: roll.rolls.join(", "), total: roll.total });
}

/** Plain text for the clipboard: one block per team. */
export function teamsText(result: TeamResult, text: Copy): string {
  const lines: string[] = [];
  result.teams.forEach((team, i) => {
    lines.push(`${fill(text.teamName, { n: i + 1 })} (${fill(text.teamSum, { sum: team.sum })})`);
    for (const p of team.players) lines.push(`- ${p.name}`);
    lines.push("");
  });
  lines.push(fill(text.teamSpread, { spread: result.spread }));
  return lines.join("\n");
}

export function orderText(names: readonly string[], starterOnly: boolean, text: Copy): string {
  if (starterOnly) return fill(text.starterIs, { name: names[0] ?? "" });
  return names.map((n, i) => `${i + 1}. ${n}`).join("\n");
}
