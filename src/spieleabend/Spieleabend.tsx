import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COUNT_MAX, COUNT_MIN, DIE_TYPES, MOD_MAX, MOD_MIN, SIDES_MAX, SIDES_MIN, clampCount, clampModifier, clampSides, notation, rollDice, stepDie, totalRange, type DiceRoll } from "./dice.ts";
import { orderText, rollText, teamsText } from "./format.ts";
import { addEntry, type HistoryEntry } from "./history.ts";
import { createPadPoller, isTypingTarget, keyAction, stepTab, type Action, type TargetLike } from "./input.ts";
import { fill, type Copy, type Lang } from "./messages.ts";
import {
  SKILL_DEFAULT,
  SKILL_MAX,
  SKILL_MIN,
  NAME_MAX,
  addPlayer,
  exportPlayers,
  importPlayers,
  presentPlayers,
  removePlayer,
  renamePlayer,
  setSkill,
  togglePresent,
} from "./players.ts";
import { randomInt } from "./random.ts";
import { TABS, loadStore, saveStore, type Settings, type StorageLike, type Store, type Tab } from "./storage.ts";
import { clampTeamCount, makeTeams, maxTeams, pickStarter, startOrder, type TeamResult } from "./teams.ts";

const ROLL_MS = 600;
const IMPORT_MAX = 256 * 1024;

function browserStorage(): StorageLike | null {
  try {
    localStorage.getItem("consolecheat-theme");
    return localStorage;
  } catch {
    return null;
  }
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function targetLike(el: EventTarget | Element | null): TargetLike {
  if (!el || !(el instanceof HTMLElement)) return null;
  return { tagName: el.tagName, type: (el as HTMLInputElement).type, isContentEditable: el.isContentEditable, role: el.getAttribute("role") };
}

function formatAt(at: string, lang: Lang): string {
  const date = new Date(at);
  const locale = lang === "de" ? "de-DE" : "en-GB";
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : date.toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Stepper({ id, label, value, min, max, onChange, text, testid }: { id: string; label: string; value: number; min: number; max: number; onChange: (n: number) => void; text: Copy; testid: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Number(raw);
    const next = Number.isFinite(n) && raw.trim() !== "" ? Math.min(max, Math.max(min, Math.round(n))) : value;
    onChange(next);
    setDraft(String(next));
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-muted">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-ghost !px-3" aria-label={`${text.less}: ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} data-testid={`${testid}-less`}>
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          className="field w-20 text-center"
          min={min}
          max={max}
          value={draft}
          data-testid={testid}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit((event.target as HTMLInputElement).value);
          }}
        />
        <button type="button" className="btn btn-ghost !px-3" aria-label={`${text.more}: ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} data-testid={`${testid}-more`}>
          +
        </button>
      </div>
    </div>
  );
}

export function Spieleabend({ text, lang }: { text: Copy; lang: Lang }) {
  const storage = useMemo(browserStorage, []);
  const initial = useMemo(() => (storage ? loadStore(storage) : null), [storage]);
  const [store, setStore] = useState<Store>(() => initial?.store ?? { players: [], settings: { sides: 6, count: 1, modifier: 0, teamCount: 2, teamMode: "skill", starterOnly: false, tab: "dice" }, history: [] });
  const [notice, setNotice] = useState(initial?.corrupt ? text.storeCorrupt : "");
  const [saveFailed, setSaveFailed] = useState(false);
  const [roll, setRoll] = useState<DiceRoll | null>(null);
  const [faces, setFaces] = useState<number[] | null>(null);
  const [teams, setTeams] = useState<TeamResult | null>(null);
  const [order, setOrder] = useState<{ names: string[]; starterOnly: boolean } | null>(null);
  const [announce, setAnnounce] = useState("");
  const [copyNote, setCopyNote] = useState("");
  const [newName, setNewName] = useState("");
  const [newSkill, setNewSkill] = useState(SKILL_DEFAULT);
  const [playerError, setPlayerError] = useState("");
  const [importNote, setImportNote] = useState("");
  const rollTimer = useRef(0);
  const rollingRef = useRef(false);
  const storeRef = useRef(store);
  storeRef.current = store;

  const { players, settings, history } = store;
  const present = useMemo(() => presentPlayers(players), [players]);
  const teamMax = maxTeams(present.length);
  const teamCount = clampTeamCount(settings.teamCount, present.length);

  useEffect(() => {
    if (!storage) return;
    setSaveFailed(!saveStore(storage, store));
  }, [storage, store]);
  useEffect(() => () => window.clearInterval(rollTimer.current), []);

  const setSettings = useCallback((patch: Partial<Settings>) => setStore((s) => ({ ...s, settings: { ...s.settings, ...patch } })), []);
  const pushHistory = useCallback((entry: HistoryEntry) => setStore((s) => ({ ...s, history: addEntry(s.history, entry) })), []);
  const setTab = useCallback((tab: Tab) => setSettings({ tab }), [setSettings]);

  const doRoll = useCallback(() => {
    const s = storeRef.current.settings;
    if (rollingRef.current) return;
    rollingRef.current = true;
    const result = rollDice({ sides: s.sides, count: s.count, modifier: s.modifier });
    const final = () => {
      window.clearInterval(rollTimer.current);
      rollingRef.current = false;
      setFaces(null);
      setRoll(result);
      setAnnounce(rollText(result, text, lang));
      pushHistory({ kind: "roll", at: new Date().toISOString(), sides: result.sides, count: result.count, modifier: result.modifier, rolls: result.rolls, total: result.total });
    };
    setCopyNote("");
    if (reducedMotion()) {
      final();
      return;
    }
    setAnnounce(text.rolling);
    const started = performance.now();
    setFaces(result.rolls.map(() => randomInt(result.sides) + 1));
    window.clearInterval(rollTimer.current);
    rollTimer.current = window.setInterval(() => {
      if (performance.now() - started >= ROLL_MS) final();
      else setFaces(result.rolls.map(() => randomInt(result.sides) + 1));
    }, 70);
  }, [lang, pushHistory, text]);

  const doTeams = useCallback(() => {
    const st = storeRef.current;
    const here = presentPlayers(st.players);
    const k = clampTeamCount(st.settings.teamCount, here.length);
    setCopyNote("");
    if (here.length < k) {
      setTeams(null);
      setAnnounce(fill(text.teamsNeed, { n: k }));
      return;
    }
    const result = makeTeams(st.settings.teamMode, here, k);
    setTeams(result);
    setAnnounce(fill(text.teamsAnnounce, { n: k, spread: result.spread }));
    pushHistory({ kind: "teams", at: new Date().toISOString(), mode: result.mode, teams: result.teams.map((t) => ({ names: t.players.map((p) => p.name), sum: t.sum })), spread: result.spread });
  }, [pushHistory, text]);

  const doOrder = useCallback(() => {
    const st = storeRef.current;
    const here = presentPlayers(st.players);
    setCopyNote("");
    if (here.length === 0) {
      setOrder(null);
      setAnnounce(text.orderNeed);
      return;
    }
    const starterOnly = st.settings.starterOnly;
    const names = starterOnly ? [pickStarter(here)!.name] : startOrder(here).map((p) => p.name);
    setOrder({ names, starterOnly });
    setAnnounce(starterOnly ? fill(text.starterIs, { name: names[0]! }) : fill(text.orderAnnounce, { names: names.join(", ") }));
    pushHistory({ kind: "order", at: new Date().toISOString(), names, starterOnly });
  }, [pushHistory, text]);

  const runAction = useCallback(
    (action: Action) => {
      const tab = storeRef.current.settings.tab;
      switch (action.type) {
        case "roll":
          setTab("dice");
          doRoll();
          return;
        case "teams":
          setTab("teams");
          doTeams();
          return;
        case "order":
          setTab("order");
          doOrder();
          return;
        case "run":
        case "reroll":
          if (tab === "dice") doRoll();
          else if (tab === "teams") doTeams();
          else doOrder();
          return;
        case "tab":
          setTab(stepTab(TABS, tab, action.step));
          return;
        case "die":
          setSettings({ sides: stepDie(storeRef.current.settings.sides, action.step) });
          return;
        case "count":
          setSettings({ count: clampCount(storeRef.current.settings.count + action.step) });
          return;
      }
    },
    [doOrder, doRoll, doTeams, setSettings, setTab],
  );

  const runRef = useRef(runAction);
  runRef.current = runAction;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = keyAction(event, targetLike(event.target));
      if (!action) return;
      event.preventDefault();
      runRef.current(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;
    const poller = createPadPoller();
    let frame = 0;
    const loop = () => {
      let pads: (Gamepad | null)[] = [];
      try {
        pads = Array.from(navigator.getGamepads());
      } catch {
        pads = [];
      }
      const blocked = isTypingTarget(targetLike(document.activeElement)) || document.hidden;
      for (const action of poller.poll(pads, blocked)) runRef.current(action);
      frame = requestAnimationFrame(loop);
    };
    const onDisconnect = (event: GamepadEvent) => poller.forget(event.gamepad.index);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, []);

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyNote(text.copied);
    } catch {
      setCopyNote(text.copyFailed);
    }
  };

  const add = () => {
    const result = addPlayer(players, newName, newSkill);
    if (!result.ok) {
      setPlayerError(text.playerErrors[result.reason]);
      return;
    }
    setPlayerError("");
    setNewName("");
    setStore((s) => ({ ...s, players: result.players }));
  };

  const download = () => {
    const blob = new Blob([exportPlayers(players)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spieleabend-spieler.json";
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > IMPORT_MAX) {
      setImportNote(text.importErrors.size);
      return;
    }
    const result = importPlayers(await file.text());
    if (!result.ok) {
      setImportNote(text.importErrors[result.reason]);
      return;
    }
    setStore((s) => ({ ...s, players: result.players }));
    setImportNote([fill(text.importDone, { n: result.players.length }), result.skipped ? fill(text.importSkipped, { n: result.skipped }) : ""].filter(Boolean).join(" "));
  };

  const tabLabels: Record<Tab, string> = { dice: text.tabDice, teams: text.tabTeams, order: text.tabOrder };
  const tab = settings.tab;
  const custom = !(DIE_TYPES as readonly number[]).includes(settings.sides);
  const range = totalRange(settings);

  const playersPanel = (
    <section className="panel rounded-xl p-3 sm:p-5" aria-labelledby="players-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="players-heading" className="font-display text-xl font-semibold tracking-tight">
          {text.playersHeading}
        </h3>
        <p className="text-sm text-muted" data-testid="players-count">
          {fill(text.playersCount, { present: present.length, total: players.length })}
        </p>
      </div>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold text-muted">
          {text.addName}
          <input className="field" maxLength={NAME_MAX + 20} value={newName} onChange={(event) => setNewName(event.target.value)} data-testid="new-name" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
          {text.addSkill}
          <input type="number" className="field w-20" min={SKILL_MIN} max={SKILL_MAX} value={newSkill} onChange={(event) => setNewSkill(Math.min(SKILL_MAX, Math.max(SKILL_MIN, Math.round(Number(event.target.value) || SKILL_DEFAULT))))} data-testid="new-skill" />
        </label>
        <button type="submit" className="btn btn-primary" data-testid="add-player">
          {text.addPlayer}
        </button>
      </form>
      {playerError ? (
        <p className="notice-bad mt-2 text-sm" role="alert" data-testid="player-error">
          {playerError}
        </p>
      ) : null}
      {players.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{text.playersEmpty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" data-testid="players">
          {players.map((p) => (
            <li key={p.id} className="player-row" data-present={p.present ? "true" : "false"}>
              <label className="inline-flex min-h-11 items-center">
                <input type="checkbox" checked={p.present} onChange={() => setStore((s) => ({ ...s, players: togglePresent(s.players, p.id) }))} aria-label={fill(text.presentLabel, { name: p.name })} data-testid="present" />
              </label>
              <input
                className="field min-w-0 flex-1"
                defaultValue={p.name}
                key={p.name}
                aria-label={fill(text.nameLabel, { name: p.name })}
                data-testid="player-name"
                onBlur={(event) => {
                  const result = renamePlayer(storeRef.current.players, p.id, event.target.value);
                  if (result.ok) {
                    setPlayerError("");
                    setStore((s) => ({ ...s, players: result.players }));
                  } else {
                    setPlayerError(text.playerErrors[result.reason]);
                    event.target.value = p.name;
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
              />
              <input
                type="number"
                className="field w-16 text-center"
                min={SKILL_MIN}
                max={SKILL_MAX}
                value={p.skill}
                aria-label={fill(text.skillLabel, { name: p.name })}
                data-testid="player-skill"
                onChange={(event) => setStore((s) => ({ ...s, players: setSkill(s.players, p.id, event.target.value) }))}
              />
              <button type="button" className="btn btn-bad !px-3" aria-label={fill(text.removePlayer, { name: p.name })} onClick={() => setStore((s) => ({ ...s, players: removePlayer(s.players, p.id) }))} data-testid="remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost" onClick={download} disabled={players.length === 0} data-testid="export">
          {text.exportPlayers}
        </button>
        <label className="btn btn-ghost">
          {text.importPlayers}
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            data-testid="import"
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {importNote ? (
        <p className="mt-2 text-sm text-muted" aria-live="polite" data-testid="import-note">
          {importNote}
        </p>
      ) : null}
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label={text.tabsLabel}
        className="flex flex-wrap gap-2"
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const next = stepTab(TABS, tab, event.key === "ArrowRight" ? 1 : -1);
          setTab(next);
          document.getElementById(`tab-${next}`)?.focus();
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            className="chip"
            data-testid={`tab-${t}`}
            onClick={() => setTab(t)}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      <p className="sr-only" aria-live="polite" data-testid="announce">
        {announce}
      </p>

      {tab === "dice" ? (
        <section id="panel-dice" role="tabpanel" aria-labelledby="tab-dice" className="panel rounded-xl p-3 sm:p-5">
          <h3 className="font-display text-xl font-semibold tracking-tight">{text.diceHeading}</h3>
          <fieldset className="mt-3">
            <legend className="text-sm font-semibold text-muted">{text.dieType}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DIE_TYPES.map((n) => (
                <button key={n} type="button" className="chip" aria-pressed={settings.sides === n} onClick={() => setSettings({ sides: n })} data-testid={`die-${n}`}>
                  {fill(text.dieLabel, { n })}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 flex flex-wrap gap-4">
            <Stepper id="dice-sides" label={text.customSides} value={settings.sides} min={SIDES_MIN} max={SIDES_MAX} onChange={(n) => setSettings({ sides: clampSides(n) })} text={text} testid="sides" />
            <Stepper id="dice-count" label={text.countLabel} value={settings.count} min={COUNT_MIN} max={COUNT_MAX} onChange={(n) => setSettings({ count: clampCount(n) })} text={text} testid="count" />
            <Stepper id="dice-mod" label={text.modifierLabel} value={settings.modifier} min={MOD_MIN} max={MOD_MAX} onChange={(n) => setSettings({ modifier: clampModifier(n) })} text={text} testid="modifier" />
          </div>
          <p className="mt-3 text-sm text-muted">
            <span className="font-mono text-fg" data-testid="notation">
              {notation(settings, lang)}
            </span>
            {custom ? ` (${text.customSides.split(" (")[0]})` : ""} · {fill(text.rollRange, { low: range.low, high: range.high })}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary min-w-32" onClick={doRoll} disabled={faces !== null} data-testid="roll">
              {roll ? text.rollAgain : text.roll}
            </button>
          </div>
          <div className="mt-4" data-testid="roll-result">
            {faces ? (
              <ul className="flex flex-wrap gap-2" aria-hidden="true">
                {faces.map((f, i) => (
                  <li key={i} className="die die-rolling">
                    {f}
                  </li>
                ))}
              </ul>
            ) : roll ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-muted">{text.rollDice}</p>
                <ul className="flex flex-wrap gap-2" data-testid="dice">
                  {roll.rolls.map((f, i) => (
                    <li key={i} className={`die${f === roll.sides ? " die-max" : f === 1 ? " die-min" : ""}`}>
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="font-display text-4xl font-semibold" data-testid="total">
                  <span className="text-base font-normal text-muted">{text.rollSum} </span>
                  {roll.total}
                </p>
                <p className="text-sm text-muted" data-testid="minmax">
                  {fill(text.rollMinMax, { min: roll.min, max: roll.max })}
                  {roll.modifier !== 0 ? ` · ${fill(text.rollModifier, { sum: roll.sum, mod: roll.modifier > 0 ? `+${roll.modifier}` : roll.modifier })}` : ""}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "teams" ? (
        <div id="panel-teams" role="tabpanel" aria-labelledby="tab-teams" className="flex flex-col gap-6">
          {playersPanel}
          <section className="panel rounded-xl p-3 sm:p-5" aria-labelledby="teams-heading">
            <h3 id="teams-heading" className="font-display text-xl font-semibold tracking-tight">
              {text.teamsHeading}
            </h3>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <Stepper id="team-count" label={text.teamCount} value={teamCount} min={2} max={teamMax} onChange={(n) => setSettings({ teamCount: n })} text={text} testid="team-count" />
              <fieldset>
                <legend className="text-sm font-semibold text-muted">{text.teamMode}</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button type="button" className="chip" aria-pressed={settings.teamMode === "skill"} onClick={() => setSettings({ teamMode: "skill" })} data-testid="mode-skill">
                    {text.modeSkill}
                  </button>
                  <button type="button" className="chip" aria-pressed={settings.teamMode === "random"} onClick={() => setSettings({ teamMode: "random" })} data-testid="mode-random">
                    {text.modeRandom}
                  </button>
                </div>
              </fieldset>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={doTeams} data-testid="make-teams">
                {teams ? text.rerollTeams : text.makeTeams}
              </button>
              {teams ? (
                <button type="button" className="btn btn-ghost" onClick={() => void copyText(teamsText(teams, text))} data-testid="copy-teams">
                  {text.copyResult}
                </button>
              ) : null}
            </div>
            {present.length < teamCount ? <p className="notice-bad mt-2 text-sm">{fill(text.teamsNeed, { n: teamCount })}</p> : null}
            {teams ? (
              <div className="mt-4" data-testid="teams-result">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {teams.teams.map((team, i) => (
                    <li key={i} className="team-card" data-testid="team">
                      <p className="font-display text-lg font-semibold">
                        {fill(text.teamName, { n: i + 1 })} <span className="text-sm font-normal text-muted" data-testid="team-sum">{fill(text.teamSum, { sum: team.sum })}</span>
                      </p>
                      <ul className="mt-1 text-sm">
                        {team.players.map((p) => (
                          <li key={p.id}>
                            {p.name} <span className="text-subtle">({p.skill})</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-fg" data-testid="spread">
                  {fill(text.teamSpread, { spread: teams.spread })}
                </p>
              </div>
            ) : null}
            {copyNote ? (
              <p className="mt-2 text-sm text-muted" aria-live="polite">
                {copyNote}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === "order" ? (
        <div id="panel-order" role="tabpanel" aria-labelledby="tab-order" className="flex flex-col gap-6">
          {playersPanel}
          <section className="panel rounded-xl p-3 sm:p-5" aria-labelledby="order-heading">
            <h3 id="order-heading" className="font-display text-xl font-semibold tracking-tight">
              {text.orderHeading}
            </h3>
            <label className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-fg">
              <input type="checkbox" checked={settings.starterOnly} onChange={(event) => setSettings({ starterOnly: event.target.checked })} data-testid="starter-only" />
              {text.starterOnly}
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={doOrder} data-testid="make-order">
                {order ? text.rerollOrder : settings.starterOnly ? text.makeStarter : text.makeOrder}
              </button>
              {order ? (
                <button type="button" className="btn btn-ghost" onClick={() => void copyText(orderText(order.names, order.starterOnly, text))} data-testid="copy-order">
                  {text.copyResult}
                </button>
              ) : null}
            </div>
            {present.length === 0 ? <p className="notice-bad mt-2 text-sm">{text.orderNeed}</p> : null}
            {order ? (
              order.starterOnly ? (
                <p className="mt-4 font-display text-2xl font-semibold" data-testid="order-result">
                  {fill(text.starterIs, { name: order.names[0]! })}
                </p>
              ) : (
                <ol className="mt-4 list-decimal pl-6 text-base" data-testid="order-result">
                  {order.names.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ol>
              )
            ) : null}
            {copyNote ? (
              <p className="mt-2 text-sm text-muted" aria-live="polite">
                {copyNote}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      <section className="panel rounded-xl p-3 sm:p-5" aria-labelledby="history-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="history-heading" className="font-display text-xl font-semibold tracking-tight">
            {text.historyHeading}
          </h3>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={history.length === 0}
            data-testid="clear-history"
            onClick={() => {
              setStore((s) => ({ ...s, history: [] }));
              setNotice(text.historyCleared);
            }}
          >
            {text.historyClear}
          </button>
        </div>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{text.historyEmpty}</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-1 text-sm" data-testid="history">
            {history.map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="flex gap-3">
                <time dateTime={entry.at} className="shrink-0 font-mono text-subtle">
                  {formatAt(entry.at, lang)}
                </time>
                <span className="min-w-0 break-words">
                  {entry.kind === "roll"
                    ? fill(text.historyRoll, { notation: notation(entry, lang), total: entry.total, rolls: entry.rolls.join(", ") })
                    : entry.kind === "teams"
                      ? `${fill(text.historyTeams, { n: entry.teams.length, mode: entry.mode === "skill" ? text.modeSkill : text.modeRandom, spread: entry.spread })}: ${entry.teams.map((t) => t.names.join(", ")).join(" | ")}`
                      : entry.starterOnly
                        ? fill(text.historyStarter, { name: entry.names[0] ?? "" })
                        : fill(text.historyOrder, { names: entry.names.join(", ") })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div aria-live="polite" data-testid="notice">
        {notice ? <p className="text-sm text-muted">{notice}</p> : null}
        {saveFailed ? <p className="notice-bad text-sm">{text.saveFailed}</p> : null}
      </div>
    </div>
  );
}
