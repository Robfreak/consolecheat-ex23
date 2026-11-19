# Spieleabend-Würfel & Teams · consolecheat-ex23

Würfeln ohne Würfelbecher, faire Teams ohne Streit und eine Startreihenfolge, die niemand anzweifelt. Teil der consolecheat-Werkzeuge. Inoffiziell, nicht von Sony.

**Live:** https://robfreak.github.io/consolecheat-ex23/ (nachdem GitHub Pages eingeschaltet ist, siehe unten)

## Zufall

Alle Würfe, Teams und Reihenfolgen nutzen `crypto.getRandomValues` (32-Bit-Werte) mit **Verwerfungsstichprobe**: Werte ab dem größten Vielfachen der Seitenzahl unter 2³² werden verworfen, deshalb gibt es keinen Modulo-Bias. Gemischt wird mit Fisher–Yates. `Math.random` wird für Ergebnisse nicht verwendet.

## Funktionen

- **Würfel:** W4, W6, W8, W10, W12, W20 oder eigene Seitenzahl (2–1000, wird begrenzt). 1–20 Würfel auf einmal und ein Modifikator von −100 bis +100. Angezeigt werden die Einzelwürfe, die Summe (mit Modifikator), der niedrigste und höchste Einzelwurf und der mögliche Bereich. Eine kurze Würfelanimation (0,6 s); mit `prefers-reduced-motion` erscheint das Ergebnis sofort. Das Ergebnis wird per `aria-live` angesagt.
- **Spieler:** Namen hinzufügen, umbenennen, entfernen, Können 1–10 (Standard 5) und anwesend/abwesend. Höchstens 100 Spieler, Namen bis 40 Zeichen (getrimmt, doppelte Namen werden abgewiesen). Export und Import als JSON (`{ "schema": "consolecheat-spieleabend-players", "version": 1, "players": [{ "name", "skill", "present" }] }`, auch eine bloße Liste von Namen); der Import ersetzt die Liste.
- **Faire Teams:** 2 bis Anzahl der anwesenden Spieler; die Größen unterscheiden sich höchstens um 1.
  - *Rein zufällig:* Fisher–Yates, dann der Reihe nach verteilt.
  - *Nach Können ausgeglichen:* Gierig (Stärkste zuerst, jeweils ins Team mit der kleinsten Summe, das noch Platz hat, Gleichstände zufällig), danach Tausch-Verbesserung (zwei Spieler verschiedener Teams tauschen, solange der Abstand oder bei gleichem Abstand die Varianz sinkt) und einige Neustarts aus zufälliger Reihenfolge; das beste Ergebnis gewinnt. Gezeigt werden die Summe je Team und der Abstand zwischen stärkstem und schwächstem Team. Neu auslosen liefert andere, gleich faire Teams.
  - Ergebnis als Text kopieren.
- **Startreihenfolge:** die anwesenden Spieler gemischt, oder nur ein Startspieler.
- **Verlauf:** die letzten 50 Würfe, Teams und Reihenfolgen mit Zeitpunkt, löschbar.
- DE/EN (Standard Deutsch), hell/dunkel, ab 390 px Breite, Reiter mit `role="tablist"`, Tastatur und Screenreader.

## Steuerung

| Tastatur | Controller | Aktion |
| --- | --- | --- |
| R, Leertaste | | Würfeln |
| T | | Teams bilden |
| O | | Reihenfolge auslosen |
| | × | Aktion des Reiters (würfeln, Teams, Reihenfolge) |
| | △ | Nochmal / neu auslosen |
| | L1 / R1 | Reiter wechseln (Würfel / Teams / Reihenfolge) |
| | Steuerkreuz hoch/runter | Würfelart |
| | Steuerkreuz links/rechts | Anzahl Würfel |

In Textfeldern, Zahlenfeldern und Auswahllisten greifen keine Kürzel; auf Knöpfen behält die Leertaste ihre normale Funktion. Der erste Abruf eines Controllers, auch nach dem Wiederverbinden oder wenn ein anderer Controller an derselben Stelle steckt, merkt sich nur den Tastenzustand. Hat ein Feld den Fokus, reagiert auch der Controller nicht.

## Speicher

`consolecheat-spieleabend-v1` (Schema `consolecheat-spieleabend`, Version 1): Spieler, Einstellungen (Würfel, Anzahl, Modifikator, Teamzahl, Modus, nur Startspieler, Reiter) und Verlauf (höchstens 50). Unlesbare Teile werden übersprungen, eine andere Version fällt auf leere Daten zurück. Der Knopf auf der Datenschutz-Seite löscht nur diesen Schlüssel.

## Entwicklung

Node 22.6 oder neuer.

```sh
npm ci
npm test        # node --test über src/spieleabend/*.test.ts
npm run build   # tsc, vite build, scripts/check-dist.mjs
npm run dev
```

Der Code liegt in `src/spieleabend`. Die Seite lädt nichts von Dritten; `scripts/check-dist.mjs` prüft das im Build.

## GitHub Pages einschalten

Der Workflow `.github/workflows/pages.yml` baut bei jedem Push auf `main` und legt `dist/` in den Branch `gh-pages`. Einmalig: **Settings → Pages → Source: Deploy from a branch → Branch `gh-pages` / `(root)`**. Danach ist die Seite unter https://robfreak.github.io/consolecheat-ex23/ erreichbar.

## Lizenz der Schriften

Outfit und Source Sans 3 stehen unter der SIL Open Font License, siehe `public/FONT-OFL.txt` und `THIRD_PARTY_NOTICES.md`.
