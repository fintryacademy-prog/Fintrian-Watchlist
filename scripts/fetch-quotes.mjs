// Holt Tageskursreihen und schreibt fertig berechnete Kennzahlen nach data/quotes.json.
// Läuft ohne npm-Abhängigkeiten auf Node 20+ (eingebautes fetch).
//
// Abrufkette pro Wert: Twelve Data -> Yahoo -> Stooq.
// Die Quelle, die zuletzt funktioniert hat, wird beim nächsten Lauf zuerst
// versucht. Dadurch werden Abrufkontingent und Laufzeit geschont.

import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.TWELVEDATA_API_KEY || '';
const PAUSE_MS = Number(process.env.PAUSE_MS || 8100); // Twelve Data: 8 Abrufe pro Minute
const HISTORIE = 1300;      // Handelstage, entspricht rund fünf Jahren
const CHART_PUNKTE = 200;
const SPARK_PUNKTE = 100;

const WATCHLIST = 'data/watchlist.json';
const QUOTES = 'data/quotes.json';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Börsenkürzel je Quelle. Leerer Eintrag bedeutet: kein Zusatz nötig.
const YAHOO_SUFFIX = {
  XETR: '.DE', XPAR: '.PA', MTAA: '.MI', XMIL: '.MI', XAMS: '.AS',
  XLON: '.L', XOSL: '.OL', XSTO: '.ST', XCSE: '.CO', XHEL: '.HE',
  XTKS: '.T', XHKG: '.HK', XASX: '.AX', XTSE: '.TO', XNZE: '.NZ',
  XSWX: '.SW', XMAD: '.MC', XBRU: '.BR', XLIS: '.LS', XWBO: '.VI',
  XNYS: '', XNGS: '', XNMS: '', XNCM: '', XNAS: '', ARCX: '', BATS: ''
};

const STOOQ_SUFFIX = {
  XNYS: 'us', XNGS: 'us', XNMS: 'us', XNCM: 'us', XNAS: 'us', ARCX: 'us', BATS: 'us',
  XETR: 'de', XPAR: 'fr', XLON: 'uk', XAMS: 'nl', MTAA: 'it', XMIL: 'it',
  XTKS: 'jp', XHKG: 'hk', XMAD: 'es'
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
  const antwort = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' } });
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
  return antwort;
}

function reiheSaeubern(punkte) {
  return punkte
    .filter(p => p.d && Number.isFinite(p.c) && p.c > 0)
    .sort((a, b) => a.d.localeCompare(b.d))
    .filter((p, i, alle) => i === 0 || p.d !== alle[i - 1].d)
    .slice(-HISTORIE);
}

// Quelle 1: Twelve Data. Deckt im kostenlosen Tarif nur US-Börsen ab.
async function vonTwelveData(eintrag) {
  if (!KEY) throw new Error('kein API-Schlüssel gesetzt');

  const adresse = mitMic => {
    const p = new URLSearchParams({
      symbol: eintrag.ticker, interval: '1day',
      outputsize: String(HISTORIE), order: 'ASC', apikey: KEY
    });
    if (mitMic && eintrag.mic) p.set('mic_code', eintrag.mic);
    return `https://api.twelvedata.com/time_series?${p}`;
  };

  // Zweiter Versuch ohne Börsenplatz, weil ein falsches Marktsegment
  // (etwa XNGS statt XNCM) einen HTTP-404 auslöst.
  const versuche = eintrag.mic ? [true, false] : [false];
  let letzterFehler;

  for (const mitMic of versuche) {
    try {
      const daten = await (await holen(adresse(mitMic))).json();
      if (daten.status === 'error') throw new Error(daten.message || 'Anbieterfehler');
      if (!Array.isArray(daten.values) || !daten.values.length) throw new Error('leere Zeitreihe');
      return {
        waehrung: daten.meta?.currency || eintrag.waehrung || null,
        reihe: reiheSaeubern(daten.values.map(v => ({ d: v.datetime.slice(0, 10), c: Number(v.close) })))
      };
    } catch (fehler) {
      letzterFehler = fehler;
      if (mitMic && versuche.length > 1) await schlafen(PAUSE_MS);
    }
  }
  throw letzterFehler;
}

// Quelle 2: Yahoo. Kein Schlüssel, breite internationale Abdeckung.
// Undokumentierter Endpunkt, deshalb bewusst nur als Ausweichquelle.
async function vonYahoo(eintrag) {
  const suffix = eintrag.mic ? YAHOO_SUFFIX[eintrag.mic] : '';
  if (suffix === undefined) throw new Error(`kein Yahoo-Kürzel für ${eintrag.mic}`);
  const symbol = `${eintrag.ticker}${suffix}`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;

  const daten = await (await holen(url)).json();
  const ergebnis = daten?.chart?.result?.[0];
  if (!ergebnis) throw new Error(daten?.chart?.error?.description || 'keine Zeitreihe');

  const zeit = ergebnis.timestamp || [];
  const schluss = ergebnis.indicators?.quote?.[0]?.close || [];
  if (!zeit.length || !schluss.length) throw new Error('leere Zeitreihe');

  return {
    waehrung: ergebnis.meta?.currency || eintrag.waehrung || null,
    reihe: reiheSaeubern(zeit.map((t, i) => ({
      d: new Date(t * 1000).toISOString().slice(0, 10), c: Number(schluss[i])
    })))
  };
}

// Quelle 3: Stooq als letzte Ebene, Abdeckung lückenhaft.
async function vonStooq(eintrag) {
  const suffix = STOOQ_SUFFIX[eintrag.mic] || (eintrag.mic ? null : 'us');
  if (!suffix) throw new Error(`kein Stooq-Kürzel für ${eintrag.mic}`);
  const symbol = `${eintrag.ticker}.${suffix}`.toLowerCase();
  const text = await (await holen(`https://stooq.com/q/d/l/?s=${symbol}&i=d`)).text();
  const reihe = reiheSaeubern(text.trim().split('\n').slice(1).map(z => {
    const f = z.split(',');
    return { d: f[0], c: Number(f[4]) };
  }));
  if (reihe.length < 30) throw new Error('keine verwertbaren Daten');
  return { waehrung: eintrag.waehrung || null, reihe };
}

const QUELLEN = {
  twelvedata: { holen: vonTwelveData, pause: true },
  yahoo: { holen: vonYahoo, pause: false },
  stooq: { holen: vonStooq, pause: false }
};

// Reihenfolge: die Quelle des letzten erfolgreichen Laufs zuerst.
function reihenfolge(bevorzugt) {
  const alle = ['twelvedata', 'yahoo', 'stooq'];
  return bevorzugt && alle.includes(bevorzugt)
    ? [bevorzugt, ...alle.filter(q => q !== bevorzugt)]
    : alle;
}

async function zeitreihe(eintrag, bevorzugt, zustand) {
  const meldungen = [];

  for (const name of reihenfolge(bevorzugt)) {
    const quelle = QUELLEN[name];
    if (quelle.pause && zustand.twelveDataGenutzt) await schlafen(PAUSE_MS);
    if (quelle.pause) zustand.twelveDataGenutzt = true;

    try {
      const ergebnis = await quelle.holen(eintrag);
      if (ergebnis.reihe.length < 30) throw new Error(`nur ${ergebnis.reihe.length} Kurse`);
      if (name !== 'twelvedata') console.log(`  Quelle: ${name}`);
      return { ...ergebnis, quelle: name };
    } catch (fehler) {
      meldungen.push(`${name}: ${fehler.message}`);
    }
  }
  throw new Error(meldungen.join(' / '));
}

// Bei unbekanntem Symbol die Suchfunktion protokollieren, damit die richtige
// Schreibweise ohne eigene Recherche im Log steht.
async function symbolVorschlagen(ticker) {
  if (!KEY) return;
  try {
    const antwort = await holen(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(ticker)}&outputsize=5`);
    for (const t of ((await antwort.json()).data || []).slice(0, 5)) {
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

  const hoch52 = hoechster(reihe.slice(-252));
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
  const ergebnis = { generiertAm: new Date().toISOString(), positionen: {}, benchmarks: {}, fehlgeschlagen: [] };
  const zustand = { twelveDataGenutzt: false };
  const genutzteQuellen = {};

  const verarbeiten = async (eintrag, ziel, altBestand) => {
    console.log(`${eintrag.ticker} – ${eintrag.name}`);
    try {
      const { reihe, waehrung, quelle } = await zeitreihe(eintrag, altBestand?.[eintrag.ticker]?.quelle, zustand);
      ziel[eintrag.ticker] = {
        ...kennzahlen(reihe), waehrung, quelle,
        stale: false, abgerufenAm: new Date().toISOString()
      };
      genutzteQuellen[quelle] = (genutzteQuellen[quelle] || 0) + 1;
    } catch (fehler) {
      console.log(`  Fehlgeschlagen – ${fehler.message}`);
      ergebnis.fehlgeschlagen.push(`${eintrag.ticker}: ${fehler.message}`);
      await symbolVorschlagen(eintrag.ticker);
      const bekannt = altBestand?.[eintrag.ticker];
      ziel[eintrag.ticker] = bekannt
        ? { ...bekannt, stale: true, fehler: fehler.message }
        : { stale: true, fehler: fehler.message };
    }
  };

  for (const b of benchmarks) await verarbeiten(b, ergebnis.benchmarks, alt.benchmarks);
  for (const p of positionen) await verarbeiten(p, ergebnis.positionen, alt.positionen);

  // Relative Stärke gegen den zugeordneten Sektor-ETF, in Prozentpunkten.
  for (const p of positionen) {
    const eigen = ergebnis.positionen[p.ticker];
    const bench = ergebnis.benchmarks[p.benchmark];
    if (!eigen) continue;
    eigen.relativeStaerke = (eigen.performance?.m6 != null && bench?.performance?.m6 != null)
      ? Number((eigen.performance.m6 - bench.performance.m6).toFixed(2))
      : null;
  }

  await writeFile(QUOTES, JSON.stringify(ergebnis) + '\n');

  const ok = Object.values(ergebnis.positionen).filter(p => !p.stale).length;
  console.log(`\nFertig: ${ok} von ${positionen.length} Positionen aktualisiert.`);
  console.log(`Quellen: ${Object.entries(genutzteQuellen).map(([q, n]) => `${q} ${n}`).join(', ') || 'keine'}`);
  if (ergebnis.fehlgeschlagen.length) {
    console.log(`\nNicht abgerufen:\n  ${ergebnis.fehlgeschlagen.join('\n  ')}`);
  }
}

main().catch(fehler => {
  console.error('Abbruch:', fehler.message);
  process.exit(1);
});
