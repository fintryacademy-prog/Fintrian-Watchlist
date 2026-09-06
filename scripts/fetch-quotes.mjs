// Holt Tageskursreihen, aggregiert Kerzen und schreibt fertig berechnete
// Kennzahlen nach data/quotes.json. Ohne npm-Abhängigkeiten, Node 20+.
//
// Kursquellen pro Wert: Twelve Data -> Yahoo -> Stooq.
// Die Quelle, die zuletzt funktioniert hat, wird zuerst versucht.
// Quartalstermine kommen von Finnhub, sofern ein Schlüssel hinterlegt ist.

import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.TWELVEDATA_API_KEY || '';
const FINNHUB = process.env.FINNHUB_API_KEY || '';
const PAUSE_MS = Number(process.env.PAUSE_MS || 8100);   // Twelve Data: 8/Minute
const YAHOO_PAUSE_MS = Number(process.env.YAHOO_PAUSE_MS || 1500);
const HISTORIE = 1300;
const SPARK_PUNKTE = 100;
const KERZEN = { tag: 130, woche: 160, monat: 60 };

const WATCHLIST = 'data/watchlist.json';
const QUOTES = 'data/quotes.json';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const YAHOO_SUFFIX = {
  XETR: '.DE', XPAR: '.PA', MTAA: '.MI', XMIL: '.MI', XAMS: '.AS',
  XLON: '.L', XOSL: '.OL', XSTO: '.ST', XCSE: '.CO', XHEL: '.HE',
  XTKS: '.T', XHKG: '.HK', XASX: '.AX', XTSE: '.TO', XNZE: '.NZ',
  XSWX: '.SW', XMAD: '.MC', XBRU: '.BR', XLIS: '.LS', XWBO: '.VI'
};

const STOOQ_SUFFIX = {
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

async function holen(url, kopf = {}) {
  const antwort = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*', ...kopf } });
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
  return antwort;
}

function reiheSaeubern(punkte) {
  return punkte
    .filter(p => p.d && Number.isFinite(p.c) && p.c > 0)
    .map(p => ({
      d: p.d,
      o: Number.isFinite(p.o) && p.o > 0 ? p.o : p.c,
      h: Number.isFinite(p.h) && p.h > 0 ? p.h : p.c,
      l: Number.isFinite(p.l) && p.l > 0 ? p.l : p.c,
      c: p.c
    }))
    .sort((a, b) => a.d.localeCompare(b.d))
    .filter((p, i, alle) => i === 0 || p.d !== alle[i - 1].d)
    .slice(-HISTORIE);
}

// Quelle 1: Twelve Data. Kostenlos nur US-Börsen.
async function vonTwelveData(eintrag) {
  if (!KEY) throw new Error('kein API-Schlüssel gesetzt');
  const p = new URLSearchParams({
    symbol: eintrag.ticker, interval: '1day',
    outputsize: String(HISTORIE), order: 'ASC', apikey: KEY
  });
  if (eintrag.mic) p.set('mic_code', eintrag.mic);

  const daten = await (await holen(`https://api.twelvedata.com/time_series?${p}`)).json();
  if (daten.status === 'error') throw new Error(daten.message || 'Anbieterfehler');
  if (!Array.isArray(daten.values) || !daten.values.length) throw new Error('leere Zeitreihe');

  return {
    waehrung: daten.meta?.currency || eintrag.waehrung || null,
    reihe: reiheSaeubern(daten.values.map(v => ({
      d: v.datetime.slice(0, 10),
      o: Number(v.open), h: Number(v.high), l: Number(v.low), c: Number(v.close)
    })))
  };
}

// Quelle 2: Yahoo. Undokumentiert, blockt Anfragen ohne Sitzungscookie mit
// HTTP 429. Deshalb einmaliger Handschlag und Wiederholversuche.
let yahooKeks = null;

async function yahooHandschlag() {
  if (yahooKeks !== null) return;
  yahooKeks = '';
  try {
    const antwort = await fetch('https://fc.yahoo.com', {
      headers: { 'user-agent': UA }, redirect: 'manual'
    });
    const kekse = antwort.headers.getSetCookie?.() || [];
    yahooKeks = kekse.map(k => k.split(';')[0]).join('; ');
    if (yahooKeks) console.log('  Yahoo-Sitzung eingerichtet');
  } catch { /* ohne Cookie weiterversuchen */ }
}

async function vonYahoo(eintrag) {
  await yahooHandschlag();
  const suffix = eintrag.mic ? YAHOO_SUFFIX[eintrag.mic] : '';
  if (suffix === undefined) throw new Error(`kein Yahoo-Kürzel für ${eintrag.mic}`);
  const symbol = `${eintrag.ticker}${suffix}`;

  const wartezeiten = [0, 2500, 7000];
  const hosts = ['query1', 'query2'];
  let letzterFehler;

  for (let versuch = 0; versuch < wartezeiten.length; versuch++) {
    if (wartezeiten[versuch]) await schlafen(wartezeiten[versuch]);
    const host = hosts[versuch % hosts.length];
    const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;

    try {
      const antwort = await holen(url, yahooKeks ? { cookie: yahooKeks } : {});
      const daten = await antwort.json();
      const e = daten?.chart?.result?.[0];
      if (!e) throw new Error(daten?.chart?.error?.description || 'keine Zeitreihe');

      const zeit = e.timestamp || [];
      const q = e.indicators?.quote?.[0] || {};
      if (!zeit.length || !q.close?.length) throw new Error('leere Zeitreihe');

      return {
        waehrung: e.meta?.currency || eintrag.waehrung || null,
        reihe: reiheSaeubern(zeit.map((t, i) => ({
          d: new Date(t * 1000).toISOString().slice(0, 10),
          o: Number(q.open?.[i]), h: Number(q.high?.[i]),
          l: Number(q.low?.[i]), c: Number(q.close?.[i])
        })))
      };
    } catch (fehler) {
      letzterFehler = fehler;
      if (!String(fehler.message).includes('429')) break; // nur Drosselung wiederholen
    }
  }
  throw letzterFehler;
}

// Quelle 3: Stooq, nur Schlusskurse, Abdeckung lückenhaft.
async function vonStooq(eintrag) {
  const suffix = eintrag.mic ? STOOQ_SUFFIX[eintrag.mic] : 'us';
  if (!suffix) throw new Error(`kein Stooq-Kürzel für ${eintrag.mic}`);
  const symbol = `${eintrag.ticker}.${suffix}`.toLowerCase();
  const text = await (await holen(`https://stooq.com/q/d/l/?s=${symbol}&i=d`)).text();
  const reihe = reiheSaeubern(text.trim().split('\n').slice(1).map(z => {
    const f = z.split(',');
    return { d: f[0], o: Number(f[1]), h: Number(f[2]), l: Number(f[3]), c: Number(f[4]) };
  }));
  if (reihe.length < 30) throw new Error('keine verwertbaren Daten');
  return { waehrung: eintrag.waehrung || null, reihe };
}

// Pence und Pfund werden von Anbietern unterschiedlich geschrieben.
const waehrungGleich = (a, b) => {
  const norm = w => String(w).toUpperCase().replace('GBX', 'GBP');
  return norm(a) === norm(b);
};

// Schutz gegen Namensverwechslung: eine abweichende Währung bedeutet,
// dass ein anderes Wertpapier geliefert wurde.
function pruefeWaehrung(eintrag, geliefert) {
  if (!eintrag.waehrung || !geliefert) return;
  if (!waehrungGleich(eintrag.waehrung, geliefert)) {
    throw new Error(`Währung weicht ab (erwartet ${eintrag.waehrung}, geliefert ${geliefert})`);
  }
}

const QUELLEN = {
  twelvedata: { holen: vonTwelveData, pause: PAUSE_MS },
  yahoo: { holen: vonYahoo, pause: YAHOO_PAUSE_MS },
  stooq: { holen: vonStooq, pause: 500 }
};

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
    if (zustand.zuletzt === name) await schlafen(quelle.pause);
    zustand.zuletzt = name;

    try {
      const ergebnis = await quelle.holen(eintrag);
      if (ergebnis.reihe.length < 30) throw new Error(`nur ${ergebnis.reihe.length} Kurse`);
      pruefeWaehrung(eintrag, ergebnis.waehrung);
      if (name !== 'twelvedata') console.log(`  Quelle: ${name}`);
      return { ...ergebnis, quelle: name };
    } catch (fehler) {
      meldungen.push(`${name}: ${fehler.message}`);
    }
  }
  throw new Error(meldungen.join(' / '));
}

async function symbolVorschlagen(ticker) {
  if (!KEY) return;
  try {
    const antwort = await holen(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(ticker)}&outputsize=4`);
    for (const t of ((await antwort.json()).data || []).slice(0, 4)) {
      console.log(`    Vorschlag: symbol=${t.symbol}  mic_code=${t.mic_code}  (${t.instrument_name}, ${t.exchange})`);
    }
  } catch { /* optional */ }
}

// -------------------------------------------------------- Quartalstermine

async function termine(eintrag) {
  if (!FINNHUB || eintrag.mic) return null; // kostenlos nur US-Werte
  const basis = 'https://finnhub.io/api/v1';
  const bis = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);

  try {
    const kommend = await (await holen(
      `${basis}/calendar/earnings?from=${heute()}&to=${bis}&symbol=${eintrag.ticker}&token=${FINNHUB}`)).json();
    const vergangen = await (await holen(
      `${basis}/stock/earnings?symbol=${eintrag.ticker}&token=${FINNHUB}`)).json();

    const naechster = (kommend.earningsCalendar || [])
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const letzter = Array.isArray(vergangen) ? vergangen[0] : null;

    if (!naechster && !letzter) return null;
    return {
      naechster: naechster ? {
        datum: naechster.date,
        zeitpunkt: naechster.hour || null,
        quartal: naechster.quarter && naechster.year ? `Q${naechster.quarter} ${naechster.year}` : null,
        epsErwartet: naechster.epsEstimate ?? null
      } : null,
      letzter: letzter ? {
        datum: letzter.period,
        epsErwartet: letzter.estimate ?? null,
        epsGemeldet: letzter.actual ?? null,
        abweichung: letzter.surprisePercent ?? null
      } : null
    };
  } catch {
    return null;
  }
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

// Gruppenschlüssel: Kalenderwoche beziehungsweise Monat.
function wochenSchluessel(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const tag = (d.getUTCDay() + 6) % 7;              // Montag = 0
  d.setUTCDate(d.getUTCDate() - tag);
  return d.toISOString().slice(0, 10);
}

function zusammenfassen(reihe, schluessel, anzahl) {
  const gruppen = new Map();
  for (const p of reihe) {
    const k = schluessel(p.d);
    const g = gruppen.get(k);
    if (!g) gruppen.set(k, { d: k, o: p.o, h: p.h, l: p.l, c: p.c });
    else { g.h = Math.max(g.h, p.h); g.l = Math.min(g.l, p.l); g.c = p.c; }
  }
  return [...gruppen.values()].slice(-anzahl);
}

const kerzenPacken = kerzen => ({
  d: kerzen.map(k => k.d),
  o: kerzen.map(k => runden(k.o)),
  h: kerzen.map(k => runden(k.h)),
  l: kerzen.map(k => runden(k.l)),
  c: kerzen.map(k => runden(k.c))
});

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
    kerzen: {
      tag: kerzenPacken(reihe.slice(-KERZEN.tag)),
      woche: kerzenPacken(zusammenfassen(reihe, wochenSchluessel, KERZEN.woche)),
      monat: kerzenPacken(zusammenfassen(reihe, d => d.slice(0, 7) + '-01', KERZEN.monat))
    }
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
  const zustand = { zuletzt: null };
  const genutzt = {};

  const verarbeiten = async (eintrag, ziel, altBestand, mitTerminen) => {
    console.log(`${eintrag.ticker} – ${eintrag.name}`);
    try {
      const { reihe, waehrung, quelle } = await zeitreihe(eintrag, altBestand?.[eintrag.ticker]?.quelle, zustand);
      ziel[eintrag.ticker] = {
        ...kennzahlen(reihe), waehrung, quelle,
        termine: mitTerminen ? await termine(eintrag) : null,
        stale: false, abgerufenAm: new Date().toISOString()
      };
      genutzt[quelle] = (genutzt[quelle] || 0) + 1;
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

  for (const b of benchmarks) await verarbeiten(b, ergebnis.benchmarks, alt.benchmarks, false);
  for (const p of positionen) await verarbeiten(p, ergebnis.positionen, alt.positionen, true);

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
  const mitTerminen = Object.values(ergebnis.positionen).filter(p => p.termine).length;
  console.log(`\nFertig: ${ok} von ${positionen.length} Positionen aktualisiert.`);
  console.log(`Quellen: ${Object.entries(genutzt).map(([q, n]) => `${q} ${n}`).join(', ') || 'keine'}`);
  console.log(`Quartalstermine: ${FINNHUB ? `${mitTerminen} Werte` : 'kein Finnhub-Schlüssel hinterlegt'}`);
  if (ergebnis.fehlgeschlagen.length) {
    console.log(`\nNicht abgerufen:\n  ${ergebnis.fehlgeschlagen.join('\n  ')}`);
  }
}

main().catch(fehler => {
  console.error('Abbruch:', fehler.message);
  process.exit(1);
});
