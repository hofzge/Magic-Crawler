# MTG Deck-Crawler

Crawlt Magic-Decklisten, zeigt jede Karte mit Bild (über [Scryfall](https://scryfall.com/docs/api)) an,
findet ähnliche Decks und vergleicht zwei Listen als Diff.

Node.js ≥ 18, keine Abhängigkeiten.

## Start

```bash
cd deck-crawler
npm start            # Weboberfläche auf http://localhost:3000
npm test             # Unit-Tests
```

Umgebungsvariablen: `PORT` (Standard 3000), `DATA_DIR` (Standard `./data`).

## Quellen

| Quelle | Was | Wie |
|---|---|---|
| **MTGGoldfish** | Metagame eines Formats (`modern`, `pioneer`, `standard`, `legacy`, `pauper`, …) | `/metagame/<format>/full` → Archetyp-Seiten → Deck-Download (Text) |
| **Archidekt** | Suche nach Deckname (+ Format-Filter) | öffentliche JSON-API |
| **Moxfield** | einzelne Decks per URL | inoffizielle API – wird häufig von Cloudflare blockiert |
| **Text / URL** | beliebige Liste (MTGO, MTGA, „4x Karte“, `SB:` …) | Einfügen in der Oberfläche oder `import-file` |

Anfragen werden gedrosselt (1 s pro Host, Scryfall 100 ms) und bei 429/5xx wiederholt.
Bitte die Nutzungsbedingungen der jeweiligen Seiten beachten und nicht übermäßig crawlen.
Kartendaten werden 30 Tage in `data/cards.json` gecacht, Decks liegen in `data/decks.json`.

## Weboberfläche

- **Deckansicht**: Karten nach Typ gruppiert und nach Manawert sortiert, mit Bildern und Anzahl;
  Hover zeigt die Karte groß, Klick öffnet Scryfall. Umschaltbar auf Textansicht.
- **Ähnliche Decks**: rechts mit Ähnlichkeit in % und direktem Diff-Link.
- **Diff**: „Nur in A“, „Anzahl geändert“, „Nur in B“ und „Gemeinsam“ – für Maindeck und Sideboard,
  als Bilder oder als Tabelle.

## CLI

```bash
node cli.js crawl mtggoldfish --format modern --limit 15
node cli.js crawl archidekt "atraxa" --format commander --limit 10
node cli.js import https://archidekt.com/decks/123456
node cli.js import-file meine-liste.txt --format modern
node cli.js list [suche]
node cli.js similar <id> [--same-format]
node cli.js diff <idA> <idB>
node cli.js show <id>
```

## Ähnlichkeit

Gewichtete Jaccard-Ähnlichkeit über die Kartenanzahlen: `Σ min(a,b) / Σ max(a,b)`.
Maindeck (inkl. Commander) zählt 85 %, Sideboard 15 % (nur wenn beide Decks eins haben).
Kartennamen werden normalisiert (Vorderseite bei doppelseitigen Karten, Akzente, Groß-/Kleinschreibung),
damit Listen aus verschiedenen Quellen vergleichbar sind.

## Aufbau

```
server.js            HTTP-Server + JSON-API
cli.js               Kommandozeile
src/parse.js         Decklist-Parser, Namensnormalisierung
src/compare.js       Ähnlichkeit, Diff
src/scryfall.js      Kartenbilder/-daten mit Cache
src/sources/*.js     Archidekt, MTGGoldfish, Moxfield
public/              Weboberfläche (Vanilla JS)
```
