# Fintrian Watchlist

Statische Beobachtungsliste mit Kursen, Korrekturtiefe, Korrekturdauer und Charts.
Kein Server, keine Datenbank, kein Build-Schritt, keine externen Bibliotheken.

## Wie es funktioniert

`data/watchlist.json` enthält die Positionen und wird von Hand gepflegt.
Ein GitHub-Actions-Ablauf holt viermal täglich die Kursreihen, berechnet alle
Kennzahlen und schreibt sie nach `data/quotes.json`. Die Seite lädt nur diese
beiden Dateien und rechnet selbst nichts.

## Einrichtung

1. **Repository anlegen.** Neues öffentliches Repository auf GitHub erstellen und
   den Inhalt dieses Ordners hineinladen. Öffentlich deshalb, weil Actions-Minuten
   dort unbegrenzt sind und GitHub Pages ohne Bezahlplan funktioniert. Die Datei
   enthält keine Kundendaten, nur Wertpapiernamen.
2. **API-Schlüssel besorgen.** Kostenloses Konto bei Twelve Data anlegen und den
   Schlüssel kopieren.
3. **Schlüssel hinterlegen.** Im Repository unter *Settings → Secrets and variables
   → Actions → New repository secret* ein Secret mit dem Namen
   `TWELVEDATA_API_KEY` und dem Schlüssel als Wert anlegen.
4. **Seite veröffentlichen.** Unter *Settings → Pages* als Quelle
   *Deploy from a branch* wählen, Branch `main`, Ordner `/ (root)`, speichern.
   Nach etwa einer Minute ist die Adresse erreichbar.
5. **Ersten Abruf starten.** Unter *Actions → Kurse aktualisieren → Run workflow*.
   Der erste Lauf dauert wegen der Wartezeiten zwischen den Abrufen rund
   15 Minuten.
6. **Log prüfen.** Am Ende des Laufs steht, welche Ticker nicht abgerufen werden
   konnten. Zu jedem Fehlschlag werden Vorschläge für die korrekte Schreibweise
   samt Börsenplatz ausgegeben. Diese in `data/watchlist.json` eintragen.

## Neue Aktie hinzufügen

1. Auf github.com die Datei `data/watchlist.json` öffnen.
2. Auf das Stiftsymbol zum Bearbeiten klicken.
3. Einen vorhandenen Eintrag kopieren und die Werte anpassen:
   `ticker`, `name`, `sektor`, `rk`, `rkLabel`, `benchmark`, `waehrung`, `mic`.
4. Unten auf *Commit changes* klicken.
5. Unter *Actions* den Ablauf *Kurse aktualisieren* manuell starten, sonst
   erscheint der Wert erst beim nächsten planmäßigen Abruf.

**Aktie entfernen:** Den Block der Position löschen und committen. Wer eine
Position nur pausieren will, setzt stattdessen `"aktiv": false` — sie wird dann
nicht abgerufen und nicht angezeigt, bleibt aber erhalten.

## Felder in `data/watchlist.json`

| Feld | Bedeutung |
| --- | --- |
| `ticker` | Symbol ohne Börsen-Suffix, zum Beispiel `SAP`, nicht `SAP.DE`. |
| `mic` | Börsenplatz als MIC-Code, zum Beispiel `XETR`, `XPAR`, `XLON`, `XTKS`. Leer lassen für den Standardplatz. |
| `rk` | Risikoklasse 1 bis 5, steuert Gruppierung und Farbmarker. |
| `rkLabel` | Beschriftung der Gruppe, zum Beispiel „Qualitätswachstum“. |
| `benchmark` | Sektor-ETF für die relative Stärke. |
| `waehrung` | Nur Rückfallwert; die tatsächliche Währung kommt vom Anbieter. |
| `aktiv` | `false` blendet die Position aus, ohne sie zu löschen. |
| `notiz` | Eigener Text, erscheint im aufgeklappten Detailbereich. |

## Kennzahlen

- **Korrektur** — Abstand des Kurses zum höchsten Schlusskurs der letzten
  252 Handelstage, in Prozent.
- **Dauer** — Kalendertage seit dem Tag dieses Hochs.
- **Stufe** — bis −5 % „Am Hoch“, bis −10 % „Rücksetzer“, bis −20 % „Korrektur“,
  bis −30 % „Bärenmarkt“, darunter „Schwerer Bärenmarkt“.
- **200-Tage** — Abstand des Kurses zum Durchschnitt der letzten 200 Schlusskurse.
- **Rel. Stärke** — Sechs-Monats-Entwicklung der Aktie minus Sechs-Monats-
  Entwicklung des Sektor-ETF, in Prozentpunkten.
- Das ausgewiesene **5-Jahres-Hoch** ist das Hoch der abgerufenen Historie und
  nicht zwingend das echte Allzeithoch.

## Datenanbieter wechseln

Die gesamte Anbieterlogik steckt in `scripts/fetch-quotes.mjs` in den Funktionen
`vonTwelveData` und `vonStooq`. Beide liefern dieselbe Struktur: eine aufsteigend
sortierte Liste aus Datum und Schlusskurs plus Währung. Ein Wechsel bedeutet, eine
dieser Funktionen zu ersetzen. Alles Übrige bleibt unverändert.

Schlägt Twelve Data für einen Wert fehl, versucht das Skript automatisch den
kostenlosen Stooq-Abruf. Dessen Abdeckung ist lückenhaft, deshalb ist er
ausdrücklich nur Ersatz.

## Wenn nach Monaten nichts mehr aktualisiert wird

GitHub schaltet geplante Abläufe in Repositories ohne Aktivität nach 60 Tagen ab.
Dagegen läuft `Zeitplan wachhalten` monatlich. Am zuverlässigsten wirkt das mit
einem persönlichen Zugriffstoken: unter *Settings → Secrets → Actions* ein Secret
`KEEPALIVE_TOKEN` mit einem fein granulierten Token anlegen, das für dieses
Repository Schreibrechte auf Inhalte hat. Ohne dieses Secret läuft der Ablauf mit
dem Standardtoken weiter.

Manuelle Rückfallebene, falls doch etwas stillsteht: einmal unter *Actions →
Kurse aktualisieren → Run workflow* klicken. Damit gilt das Repository wieder als
aktiv und alle Zeitpläne laufen weiter.

## Grenzen

- Kurse sind zeitverzögert. Echtzeitkurse für Xetra, Paris, Mailand, Oslo,
  Stockholm, Tokio, Hongkong, Sydney und Toronto sind kostenpflichtig und für den
  Zweck dieser Liste nicht nötig. Der Datenstand steht sichtbar im Seitenkopf.
- Der kostenlose Tarif erlaubt 800 Abrufe pro Tag. Bei rund 90 Werten und vier
  Läufen sind das etwa 360. Wächst die Liste deutlich, die Zahl der Läufe im
  Zeitplan reduzieren.
- Beträge werden in der jeweiligen Handelswährung gezeigt, ohne Umrechnung.
  Rolls-Royce notiert in Pence.

## Getroffene Entscheidungen

- **GitHub Pages statt Vercel oder Netlify**, weil eine rein statische Seite ohne
  Serverfunktionen nichts hat, was pausiert, einschläft oder ein Kontingent
  überschreitet.
- **Kennzahlen werden beim Abruf berechnet, nicht im Browser**, damit die Seite
  auch bei achtzig Positionen sofort steht und die Zahlen für alle Betrachter
  identisch sind.
- **Die Tabellenansicht ist dieselbe Zeilendarstellung ohne Sektorgruppierung**,
  statt einer zweiten, separat gepflegten Tabelle. Eine Darstellung, die
  garantiert konsistent bleibt, ist wartungsärmer als zwei.
- **Keine Symbolgrafiken, keine Firmenlogos.** Rang und Zustand werden über
  Farbmarker, Typografie und Zahlengröße codiert.
