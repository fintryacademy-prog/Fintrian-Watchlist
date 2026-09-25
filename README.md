# Fintrian Watchlist – Anleitung

Die Watchlist zeigt eure Kaufkandidaten nach Sektor und Risikoklasse, mit Kurs, Korrekturtiefe, Korrekturdauer, Marktstruktur und Charts. Sie läuft kostenlos auf GitHub Pages, ohne Server und ohne externe Bibliotheken.

Gepflegt wird genau eine Datei: `data/watchlist.json`. Alles andere läuft automatisch.

---

## 1. Was wo liegt

| Datei | Zweck | Anfassen? |
| --- | --- | --- |
| `data/watchlist.json` | eure Positionen, Risikoklassen, Zielkurse, Notizen | **ja, regelmässig** |
| `data/quotes.json` | berechnete Kursdaten | nie, wird automatisch geschrieben |
| `scripts/fetch-quotes.mjs` | holt Kurse und berechnet alle Kennzahlen | nur bei neuer Version |
| `assets/app.js` | Darstellung und Bedienung der Seite | nur bei neuer Version |
| `assets/style.css` | Farben, Schrift, Raster | nur bei neuer Version |
| `index.html` | Seitengerüst, Filter, Sortiermenü | nur bei neuer Version |
| `assets/logos/` | Firmenlogos als Bilddateien | optional |
| `.github/workflows/` | Zeitpläne für den Kursabruf | nie |

---

## 2. Täglicher Gebrauch

1. Seite öffnen: `https://fintryacademy-prog.github.io/Fintrian-Watchlist/`
2. Oben rechts den **Datenstand** prüfen. Die Kurse werden werktags viermal aktualisiert.
3. Im Menü **Struktur** den Filter auf *Strukturbruch nach oben* setzen. Das zeigt die Werte, bei denen seit dem letzten Mal etwas passiert ist.
4. Danach auf *Bodenbildung* stellen. Das sind die Werte auf Beobachtung.
5. Einen Wert anklicken, um Chart, Wendepunkte, Bruchmarke und Kennzahlen zu sehen.

**Für Kundengespräche:** Oben rechts **Präsentationsmodus** einschalten. Schrift und Zeilen werden grösser, damit sie bei Bildschirmfreigabe lesbar bleiben. Im Chart lässt sich der Zickzack mit dem Schalter **Wendepunkte** aus- und einblenden, erst der saubere Chart, dann die Struktur.

---

## 3. So bearbeitest du eine Datei auf GitHub

Dieser Ablauf gilt für jede Änderung weiter unten.

1. Im Repository die Datei anklicken, zum Beispiel `data` → `watchlist.json`.
2. Oben rechts über dem Code das **Stift-Symbol** anklicken.
3. Änderung vornehmen.
4. Rechts oben **Commit changes** anklicken, im Dialog nochmals **Commit changes**.
5. Etwa eine Minute warten, dann die Seite mit `Strg + Shift + R` neu laden.

**Niemals Dateien per Hochladen ersetzen.** Beim Hochladen landen sie oft im falschen Ordner. Immer über das Stift-Symbol bearbeiten, dann bleibt der Pfad erhalten.

---

## 4. Neue Aktie hinzufügen

1. `data/watchlist.json` öffnen, Stift-Symbol.
2. Mit `Strg + F` eine Zeile aus demselben Sektor suchen.
3. Direkt darunter eine neue Zeile einfügen, nach dieser Vorlage:

```json
    { "ticker": "ADBE", "name": "Adobe", "sektor": "Information Technology", "rk": 1, "rkLabel": "Stabil & etabliert", "benchmark": "IGV", "waehrung": "USD", "mic": "", "aktiv": true, "zielkurs": null, "notiz": "" },
```

4. Commit changes.
5. **Actions** → **Kurse aktualisieren** → **Run workflow**. Ohne diesen Lauf bleibt der neue Wert leer bis zum nächsten planmässigen Abruf.

**Die Felder:**

| Feld | Bedeutung | Beispiel |
| --- | --- | --- |
| `ticker` | Kürzel ohne Börsen-Zusatz | `SAP`, nicht `SAP.DE` |
| `name` | Firmenname, wie er angezeigt wird | `SAP` |
| `sektor` | einer der elf Sektoren, exakt geschrieben | `Health Care` |
| `rk` | Risikoklasse 1 bis 5 | `3` |
| `rkLabel` | Beschriftung der Gruppe | `Höheres Wachstum` |
| `benchmark` | Sektor-ETF für die relative Stärke | `XLV` |
| `waehrung` | Handelswährung, dient zur Prüfung | `EUR` |
| `mic` | Börsenplatz, **bei US-Werten leer lassen** | `XETR` |
| `aktiv` | `false` blendet die Position aus | `true` |
| `zielkurs` | euer Kaufkurs, oder `null` | `240` |
| `notiz` | eigener Text im Detailbereich | `""` |

**Sektoren und Benchmarks:**

| Sektor | Benchmark |
| --- | --- |
| Information Technology | XLK, bei Software IGV |
| Communication Services | XLC |
| Consumer Discretionary | XLY |
| Consumer Staples | XLP |
| Health Care | XLV |
| Financials | XLF |
| Industrials | XLI |
| Materials | XLB |
| Energy | XLE |
| Utilities | XLU |
| Real Estate | XLRE |

**Börsenplätze für Auslandswerte:**

| Börse | `mic` | Währung |
| --- | --- | --- |
| Xetra | `XETR` | `EUR` |
| Euronext Paris | `XPAR` | `EUR` |
| Euronext Amsterdam | `XAMS` | `EUR` |
| Borsa Italiana | `MTAA` | `EUR` |
| London | `XLON` | `GBp` (Pence) |
| Oslo | `XOSL` | `NOK` |
| Stockholm | `XSTO` | `SEK` |
| Kopenhagen | `XCSE` | `DKK` |
| Tokio | `XTKS` | `JPY` |
| Hongkong | `XHKG` | `HKD` |
| Sydney | `XASX` | `AUD` |
| Toronto | `XTSE` | `CAD` |
| Neuseeland | `XNZE` | `NZD` |

**Drei Regeln, damit die Datei nicht kaputtgeht:**

- Jede Zeile endet mit einem Komma, ausser der allerletzten vor der schliessenden Klammer `]`.
- Zahlen mit Punkt statt Komma: `112.50`, nicht `112,50`.
- Texte in Anführungszeichen, Zahlen und `true`, `false`, `null` ohne.

---

## 5. Zielkurs eintragen

Der Zielkurs ist der Kurs, zu dem ihr **kaufen** wollt.

1. `data/watchlist.json` öffnen, Stift-Symbol.
2. `Strg + F`, Ticker suchen.
3. In dieser Zeile `"zielkurs": null` ersetzen durch `"zielkurs": 240`.
4. Commit changes.

**Kein Workflow-Lauf nötig.** Der Zielkurs kommt direkt aus dieser Datei. Nach einer Minute und `Strg + Shift + R` ist er da.

Die Spalte **Zum Ziel** zeigt, wie weit der Kurs noch fallen muss: `−12,40 %` heisst, noch 12,4 Prozent bis zu eurem Kaufkurs. Liegt der Kurs bereits darunter, wird der Wert blau markiert und oben unter **In Kaufzone** gezählt.

Die Währung muss zum angezeigten Kurs passen. Bei Werten in Pence, etwa Rolls-Royce oder Diageo, also `2400` statt `24`.

---

## 6. Aktie pausieren, entfernen, umsortieren

- **Pausieren:** `"aktiv": true` auf `"aktiv": false` setzen. Die Position wird weder abgerufen noch angezeigt, bleibt aber erhalten.
- **Entfernen:** die ganze Zeile löschen. Auf das Komma der Zeile davor achten.
- **Risikoklasse ändern:** `rk` und `rkLabel` anpassen. Die Seite ordnet sich beim nächsten Laden selbst um.
- **Sektor ändern:** `sektor` und `benchmark` anpassen, danach einmal **Run workflow**, damit die relative Stärke neu berechnet wird.

---

## 7. Logo hinzufügen

1. Im Repository in den Ordner `assets/logos` wechseln.
2. **Add file** → **Upload files**.
3. Bilddatei hochladen, benannt nach dem Ticker, zum Beispiel `MSFT.png`.
4. Commit changes.

Hier ist Hochladen richtig, weil du dich bereits im Zielordner befindest. Ohne Logo zeigt die Seite eine Kachel mit dem Anfangsbuchstaben.

---

## 8. Neue Version einspielen

Wenn es eine neue Fassung von `app.js`, `style.css`, `index.html` oder `fetch-quotes.mjs` gibt:

1. Die Datei im Repository öffnen, Stift-Symbol.
2. Im Editor `Strg + A` drücken, dann den neuen Inhalt einfügen.
3. Commit changes.
4. Bei `fetch-quotes.mjs` danach **Run workflow**, bei den anderen nur `Strg + Shift + R`.

**Kontrolle:** Oben über dem Code steht die Zeilenzahl. Stimmt sie nicht mit der neuen Fassung überein, wurde beim Kopieren etwas abgeschnitten.

---

## 9. Kursabruf starten und Protokoll lesen

1. **Actions** → links **Kurse aktualisieren** → rechts **Run workflow** → grünen Knopf.
2. Nach einer Minute die Seite neu laden, der Lauf erscheint mit gelbem Punkt.
3. Nach drei bis fünfzehn Minuten ist er grün.
4. Den Lauf anklicken, **abrufen** anklicken, den Schritt *Kursdaten holen und Kennzahlen berechnen* aufklappen und ans Ende scrollen.

Dort stehen drei Zeilen:

```
Fertig: 78 von 78 Positionen aktualisiert.
Quellen: twelvedata 66, yahoo 20
Quartalstermine: 54 Werte
```

Darunter, falls etwas fehlschlug, die betroffenen Ticker mit Vorschlägen für die richtige Schreibweise.

---

## 10. Wendepunkte prüfen

Die Swing-Erkennung ist eine Regel, keine Wahrheit. Bevor Kaufzone, Invalidierung und Chance-Risiko-Verhältnis darauf aufbauen, muss sie gegen echte Charts geprüft sein.

1. Fünf Werte mit unterschiedlichem Charakter wählen: einen ruhigen Grosswert, einen im langen Abwärtstrend, einen sehr volatilen, einen mit vermuteter Bodenbildung, einen nach Wahl.
2. Jeden in der Watchlist aufklappen und parallel in TradingView öffnen.
3. Pro Wert prüfen: Sitzen H und T dort, wo ihr sie einzeichnen würdet? Stimmt der Strukturzustand? Ist die Bruchmarke die Hürde, auf die ihr selbst schaut?
4. Pro Wert ein Wort notieren: *passt*, *zu viele Punkte* oder *zu wenige*.

Die verwendete Mindestamplitude steht im Detailbereich unter **Swing-Schwelle**. Sie ergibt sich aus der Schwankungsbreite des Werts und liegt zwischen 5 und 20 Prozent.

---

## 11. Wenn etwas nicht stimmt

| Symptom | Ursache | Lösung |
| --- | --- | --- |
| Seite ohne Farben und Raster, Schrift mit Serifen | `style.css` fehlt oder enthält falschen Inhalt | Datei öffnen, erste Zeile muss mit `/* Alle Farben` beginnen, sonst neu einfügen |
| Seite zeigt nur „Kursdaten konnten nicht geladen werden" | `data/quotes.json` fehlt oder ist kaputt | **Run workflow** |
| Ein Wert zeigt überall „n. v." | Ticker oder Börsenplatz falsch | Protokoll lesen, Vorschlag übernehmen |
| Meldung „Währung weicht ab" im Protokoll | unter dem Ticker wurde ein anderes Papier gefunden | Ticker und `mic` prüfen, bei US-Werten `mic` leer lassen |
| Ein Wert wird kursiv als veraltet angezeigt | letzter Abruf schlug fehl, alte Daten bleiben stehen | nächsten Lauf abwarten, bei Dauerfehler Protokoll prüfen |
| Datenstand wird tagelang nicht neuer | GitHub hat den Zeitplan nach Inaktivität abgeschaltet | einmal **Run workflow**, danach läuft der Zeitplan weiter |
| Viele Auslandswerte scheitern mit HTTP 429 | Yahoo blockt vorübergehend | einen Tag abwarten; bei Dauerfehler ist der Grow-Tarif von Twelve Data die offizielle Lösung |
| Neue Aktie erscheint nicht | Tippfehler in `watchlist.json` | Zeile mit einer funktionierenden vergleichen, auf Kommas und Anführungszeichen achten |

---

## 12. Kennzahlen erklärt

| Spalte | Bedeutung |
| --- | --- |
| **Korrektur** | Abstand des Kurses zum höchsten Schlusskurs der letzten 252 Handelstage |
| **Zum Ziel** | wie weit der Kurs noch bis zu eurem Zielkurs fallen muss |
| **Dauer** | Kalendertage seit dem 52-Wochen-Hoch |
| **Stufe** | Am Hoch bis −5 %, Rücksetzer bis −10 %, Korrektur bis −20 %, Bärenmarkt bis −30 %, darunter Schwerer Bärenmarkt |
| **Struktur** (unter der Stufe) | Aufwärtsstruktur, Strukturbruch nach oben, Bodenbildung, Abwärtsstruktur oder Topbildung, aus der Abfolge der Wendepunkte |
| **200-Tage** | Abstand zum Durchschnitt der letzten 200 Schlusskurse |
| **Rel. Stärke** | Sechs-Monats-Entwicklung minus die des Sektor-ETF, in Prozentpunkten |

**Im Chart:**

| Linie | Farbe | Bedeutung |
| --- | --- | --- |
| 52W-Hoch | hellgrau durchgezogen | höchster Schlusskurs der letzten 12 Monate |
| 200 Tage | grau gestrichelt | 200-Tage-Durchschnitt |
| Ziel | blau gepunktet | euer Zielkurs |
| Bruchmarke | gold gestrichelt | letztes Swing-Hoch über dem Kurs, die Hürde für den Strukturbruch |
| H und T | violett | bestätigte Wendepunkte; der hohle Punkt am Ende ist noch unbestätigt |

**Farben:** Grün und Rot zeigen die Marktentwicklung, die Farbrampe von Grün nach Rot die Risikoklasse, Blau eure eigene Einschätzung.

---

## 13. Datenquellen

| Quelle | Wofür | Schlüssel |
| --- | --- | --- |
| Twelve Data | Kurse der US-Werte, offizielle Schnittstelle | Secret `TWELVEDATA_API_KEY` |
| Yahoo | Kurse der Auslandswerte, undokumentiert, kann wegfallen | keiner |
| Stooq | letzte Ausweichquelle, lückenhaft | keiner |
| Finnhub | Quartalstermine, nur US-Werte | Secret `FINNHUB_API_KEY`, optional |

Das Skript merkt sich pro Wert die zuletzt erfolgreiche Quelle und versucht sie beim nächsten Lauf zuerst. Liefert eine Quelle eine andere Währung als in `watchlist.json` hinterlegt, wird der Wert verworfen statt falsch angezeigt.

Kurse sind zeitverzögert. Keine Anlageberatung und keine Kaufempfehlung.

---

## 14. Einrichtung von Grund auf

Nur nötig, falls das Repository neu aufgesetzt werden muss.

1. Öffentliches Repository anlegen, ohne README, ohne Lizenz.
2. Alle Dateien hochladen. Den Ordner `.github` sichtbar machen (Windows: Explorer → Anzeigen → Einblenden → Ausgeblendete Elemente) oder die beiden Workflow-Dateien über **Add file** → **Create new file** mit dem Pfad `.github/workflows/update-quotes.yml` anlegen.
3. **Settings** → **Actions** → **General** → ganz unten **Workflow permissions** → **Read and write permissions** → Save.
4. **Settings** → **Secrets and variables** → **Actions** → **New repository secret**: `TWELVEDATA_API_KEY`, optional `FINNHUB_API_KEY`.
5. **Settings** → **Pages** → Source *Deploy from a branch*, Branch `main`, Ordner `/ (root)` → Save.
6. **Actions** → **Kurse aktualisieren** → **Run workflow**.
