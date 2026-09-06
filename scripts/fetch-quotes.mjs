// Holt Tageskursreihen und schreibt fertig berechnete Kennzahlen nach data/quotes.json.
// Läuft ohne npm-Abhängigkeiten auf Node 20+ (eingebautes fetch).

import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.TWELVEDATA_API_KEY || '';
const PAUSE_MS = Number(process.env.PAUSE_MS || 8100); // Free-Tier: 8 Abrufe pro Minute
const HISTORIE = 1300;      // Handelstage, entspricht rund fünf Jahren
const CHART_PUNKTE = 200;
const SPARK_PUNKTE = 100;

const WATCHLIST = 'data/watchlist.json';
const QUOTES = 'data/quotes.json';

// Börsenkürzel für den Ersatzabruf über Stooq. Nicht jeder Platz ist dort vorhanden.
const STOOQ_SUFFIX = {
  XNYS: 'us', XNGS: 'us', XNAS: 'us', ARCX: 'us',
  XETR: 'de', XPAR: 'fr', XLON: 'uk', XAMS: 'nl',
  MTAA: 'it', XTKS: 'jp', XHKG: 'hk'
};

const schlafen = ms => new Promise(r => setTimeout(r, ms));
const heute = () => new Date().toISOString().slice(0, 10);

function monateZurueck(iso, monate) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - monate);
  return d.toISOString().slice(0, 10);
}

function tageZwischen(vonIso, bisIso) {
  const ms = new Date(bisIso + 'T00:00:00Z') - new Date(vonIso + 'T00:00:00Z');
  return Math.max(0, Math.round(ms / 86400000));
}

function runden(zahl) {
  if (!Number.isFinite(zahl)) return null;
  const stellen = Math.abs(zahl) >= 100 ? 2 : Math.abs(zahl) >= 1 ? 3 : 5;
  return Number(zahl.toFixed(stellen));
}

const prozent = (neu, alt) => (alt > 0 ? Number(((neu / alt - 1) * 100).toFixed(2)) : null);

// ---------------------------------------------------------------- Datenabruf

async function holen(url) {
  const antwort = await fetch(url, { headers: { 'user-agent': 'fintrian-watchlist' } });
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
  return antwort;
}

// Einzige Stelle mit Anbieterlogik. Ein Wechsel betrifft nur diese beiden Funktionen.
async function vonTwelveData(eintrag) {
  if (!KEY) throw new Error('Kein API-Schlüssel gesetzt');
  const bauen = mitMic => {
    const p = new URLSearchParams({
      symbol: eintrag.ticker, interval: '1day', outputsize: String(HISTORIE),
      order: 'ASC', apikey: KEY
    });
    if (mitMic && eintrag.mic) p.set('mic_code', eintrag.mic);
    return `https://api.twelvedata.com/time_series?${p}`;
  };

  let daten = await (await holen(bauen(true))).json();
  if (daten.status === 'error' && eintrag.mic) {
    await schlafen(PAUSE_MS);
    daten = await (await holen(bauen(false))).json(); // zweiter Versuch ohne Börsenplatz
  }
  if (daten.status === 'error') throw new Error(daten.message || 'Anbieterfehler');
  if (!Array.isArray(daten.values) || !daten.values.length) throw new Error('Leere Zeitreihe');

  return {
    waehrung: daten.meta?.currency || eintrag.waehrung || null,
    reihe: daten.values
      .map(v => ({ d: v.datetime.slice(0, 10), c: Number(v.close) }))
      .filter(p => Number.isFinite(p.c) && p.c > 0)
      .sort((a, b) => a.d.localeCompare(b.d))
  };
}

async function vonStooq(eintrag) {
  const suffix = STOOQ_SUFFIX[eintrag.mic] || (eintrag.mic ? null : 'us');
  if (!suffix) throw new Error('Kein Ersatzabruf für diesen Börsenplatz');
  const symbol = `${eintrag.ticker}.${suffix}`.toLowerCase();
  const text = await (await holen(`https://stooq.com/q/d/l/?s=${symbol}&i=d`)).text();
  const zeilen = text.trim().split('\n').slice(1);
  const reihe = zeilen.map(z => {
    const f = z.split(',');
    return { d: f[0], c: Number(f[4]) };
  }).filter(p => p.d && Number.isFinite(p.c) && p.c > 0);
  if (reihe.length < 30) throw new Error('Ersatzabruf ohne verwertbare Daten');
  return { waehrung: eintrag.waehrung || null, reihe: reihe.slice(-HISTORIE) };
}

async function zeitreihe(eintrag) {
  try {
    return await vonTwelveData(eintrag);
  } catch (fehler) {
    try {
      const ersatz = await vonStooq(eintrag);
      console.log(`  Ersatzquelle Stooq verwendet (${fehler.message})`);
      return ersatz;
    } catch {
      throw fehler;
    }
  }
}

// Bei einem unbekannten Symbol die Suchfunktion des Anbieters protokollieren,
// damit die richtige Schreibweise ohne eigene Recherche im Log steht.
async function symbolVorschlagen(ticker) {
  if (!KEY) return;
  try {
    const antwort = await holen(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(ticker)}&outputsize=5`);
    const treffer = (await antwort.json()).data || [];
    for (const t of treffer.slice(0, 5)) {
      console.log(`    Vorschlag: symbol=${t.symbol}  mic_code=${t.mic_code}  (${t.instrument_name}, ${t.exchange})`);
    }
  } catch { /* Vorschläge sind optional */ }
}

// ------------------------------------------------------------- Berechnungen

function abtasten(reihe, punkte) {
  if (reihe.length <= punkte) return reihe;
  const schritt = (reihe.length - 1) / (punkte - 1);
  return Array.from({ length: punkte }, (_, i) => reihe[Math.round(i * schritt)]);
}

function letzterVor(reihe, datum) {
  for (let i = reihe.length - 1; i >= 0; i--) if (reihe[i].d <= datum) return reihe[i];
  return null;
}

function hoechster(reihe) {
  return reihe.reduce((max, p) => (p.c > max.c ? p : max), reihe[0]);
}

function korrekturStufe(tiefe) {
  if (tiefe === null) return null;
  if (tiefe > -5) return 'Am Hoch';
  if (tiefe > -10) return 'Rücksetzer';
  if (tiefe > -20) return 'Korrektur';
  if (tiefe > -30) return 'Bärenmarkt';
  return 'Schwerer Bärenmarkt';
}

function performance(reihe, letzte) {
  const seit = monate => {
    const ref = letzterVor(reihe, monateZurueck(letzte.d, monate));
    return ref ? prozent(letzte.c, ref.c) : null;
  };
  const jahresende = letzterVor(reihe, `${letzte.d.slice(0, 4) - 1}-12-31`);
  return {
    m1: seit(1), m3: seit(3), m6: seit(6), j1: seit(12),
    ytd: jahresende ? prozent(letzte.c, jahresende.c) : null
  };
}

function kennzahlen(reihe) {
  const letzte = reihe.at(-1);
  const vortag = reihe.at(-2);

  const fenster52 = reihe.slice(-252);
  const hoch52 = hoechster(fenster52);
  const hoch5j = hoechster(reihe);

  const tiefe52 = prozent(letzte.c, hoch52.c);
  const tage = tageZwischen(hoch52.d, heute());

  const ma200Basis = reihe.slice(-200);
  const ma200 = ma200Basis.length === 200
    ? ma200Basis.reduce((s, p) => s + p.c, 0) / 200
    : null;

  const jahr = reihe.filter(p => p.d >= monateZurueck(letzte.d, 12));
  const sparkRoh = abtasten(jahr.length > 5 ? jahr : reihe, SPARK_PUNKTE);
  const min = Math.min(...sparkRoh.map(p => p.c));
  const max = Math.max(...sparkRoh.map(p => p.c));
  const spanne = max - min || 1;

  const drei = reihe.filter(p => p.d >= monateZurueck(letzte.d, 36));
  const chart = abtasten(drei.length > 5 ? drei : reihe, CHART_PUNKTE);

  return {
    kurs: runden(letzte.c),
    kursDatum: letzte.d,
    veraenderungTag: vortag ? prozent(letzte.c, vortag.c) : null,
    hoch52w: { kurs: runden(hoch52.c), datum: hoch52.d },
    hoch5j: { kurs: runden(hoch5j.c), datum: hoch5j.d },
    korrekturTiefe: tiefe52,
    korrekturTiefe5j: prozent(letzte.c, hoch5j.c),
    korrekturTage: tage,
    korrekturMonate: Number((tage / 30.44).toFixed(1)),
    korrekturStufe: korrekturStufe(tiefe52),
    ma200: runden(ma200),
    abstandMa200: ma200 ? prozent(letzte.c, ma200) : null,
    performance: performance(reihe, letzte),
    spark: sparkRoh.map(p => Number(((p.c - min) / spanne).toFixed(3))),
    chart: { d: chart.map(p => p.d), c: chart.map(p => runden(p.c)) }
  };
}

// ------------------------------------------------------------------- Ablauf

async function main() {
  const liste = JSON.parse(await readFile(WATCHLIST, 'utf8'));
  let alt = { positionen: {}, benchmarks: {} };
  try { alt = JSON.parse(await readFile(QUOTES, 'utf8')); } catch { /* erster Lauf */ }

  const positionen = liste.positionen.filter(p => p.aktiv !== false);
  const benchmarks = liste.benchmarks || [];
  const ergebnis = { generiertAm: new Date().toISOString(), positionen: {}, benchmarks: {} };
  const fehlgeschlagen = [];
  let erster = true;

  const verarbeiten = async (eintrag, ziel, altBestand) => {
    if (!erster) await schlafen(PAUSE_MS);
    erster = false;
    console.log(`${eintrag.ticker} – ${eintrag.name}`);
    try {
      const { reihe, waehrung } = await zeitreihe(eintrag);
      if (reihe.length < 30) throw new Error(`Nur ${reihe.length} Kurse geliefert`);
      ziel[eintrag.ticker] = { ...kennzahlen(reihe), waehrung, stale: false, abgerufenAm: new Date().toISOString() };
    } catch (fehler) {
      console.log(`  Fehlgeschlagen: ${fehler.message}`);
      fehlgeschlagen.push(`${eintrag.ticker}: ${fehler.message}`);
      await symbolVorschlagen(eintrag.ticker);
      const bekannt = altBestand?.[eintrag.ticker];
      if (bekannt) ziel[eintrag.ticker] = { ...bekannt, stale: true, fehler: fehler.message };
      else ziel[eintrag.ticker] = { stale: true, fehler: fehler.message };
    }
  };

  for (const b of benchmarks) await verarbeiten(b, ergebnis.benchmarks, alt.benchmarks);
  for (const p of positionen) await verarbeiten(p, ergebnis.positionen, alt.positionen);

  // Relative Stärke gegen den zugeordneten Sektor-ETF, in Prozentpunkten.
  for (const p of positionen) {
    const eigen = ergebnis.positionen[p.ticker];
    const bench = ergebnis.benchmarks[p.benchmark];
    if (eigen?.performance?.m6 != null && bench?.performance?.m6 != null) {
      eigen.relativeStaerke = Number((eigen.performance.m6 - bench.performance.m6).toFixed(2));
    } else if (eigen) {
      eigen.relativeStaerke = null;
    }
  }

  ergebnis.fehlgeschlagen = fehlgeschlagen;
  await writeFile(QUOTES, JSON.stringify(ergebnis) + '\n');

  const ok = Object.values(ergebnis.positionen).filter(p => !p.stale).length;
  console.log(`\nFertig: ${ok} von ${positionen.length} Positionen aktualisiert.`);
  if (fehlgeschlagen.length) console.log(`Nicht abgerufen: ${fehlgeschlagen.join(' | ')}`);
}

main().catch(fehler => {
  console.error('Abbruch:', fehler.message);
  process.exit(1);
});
