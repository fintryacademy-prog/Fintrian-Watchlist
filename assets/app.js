const SEKTOREN = [
  'Information Technology', 'Communication Services', 'Consumer Discretionary',
  'Consumer Staples', 'Health Care', 'Financials', 'Industrials',
  'Materials', 'Energy', 'Utilities', 'Real Estate'
];

const STUFEN_RANG = {
  'Am Hoch': 0, 'Rücksetzer': 1, 'Korrektur': 2,
  'Bärenmarkt': 3, 'Schwerer Bärenmarkt': 4
};

const NV = 'n. v.';

const zustand = {
  positionen: [], benchmarks: {}, generiertAm: null,
  suche: '', rk: new Set(), stufe: 'alle', sortierung: 'sektor',
  ansicht: 'sektor', offen: null
};

const $ = wahl => document.querySelector(wahl);
const inhalt = $('#inhalt');

// -------------------------------------------------------------- Formate

const f2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f4 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const f0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const f1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const fmtKurs = (wert, waehrung) =>
  wert == null ? NV : `${(Math.abs(wert) >= 1 ? f2 : f4).format(wert)} ${waehrung || ''}`.trim();

const fmtProzent = wert =>
  wert == null ? NV : `${wert > 0 ? '+' : wert < 0 ? '\u2212' : ''}${f2.format(Math.abs(wert))} %`;

const fmtPunkte = wert =>
  wert == null ? NV : `${wert > 0 ? '+' : wert < 0 ? '\u2212' : ''}${f2.format(Math.abs(wert))} Pp`;

const fmtDatum = iso => {
  if (!iso) return NV;
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
};

const fmtZeitpunkt = iso => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${fmtDatum(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr`;
};

const vorzeichenKlasse = wert => (wert == null ? 'leer' : wert > 0 ? 'positiv' : wert < 0 ? 'negativ' : '');

function el(tag, klasse, text) {
  const knoten = document.createElement(tag);
  if (klasse) knoten.className = klasse;
  if (text != null) knoten.textContent = text;
  return knoten;
}

function zelle(klasse, oben, obenKlasse, unten, untenKlasse) {
  const box = el('div', klasse);
  const a = el('div', obenKlasse, oben);
  box.append(a);
  if (unten != null) box.append(el('div', untenKlasse, unten));
  return box;
}

// ---------------------------------------------------------------- Laden

async function laden(pfad) {
  const antwort = await fetch(`${pfad}?t=${Date.now()}`, { cache: 'no-store' });
  if (!antwort.ok) throw new Error(`${pfad} nicht erreichbar (HTTP ${antwort.status})`);
  return antwort.json();
}

async function start() {
  try {
    const [liste, kurse] = await Promise.all([laden('data/watchlist.json'), laden('data/quotes.json')]);
    zustand.benchmarks = kurse.benchmarks || {};
    zustand.generiertAm = kurse.generiertAm;
    zustand.positionen = liste.positionen
      .filter(p => p.aktiv !== false)
      .map(p => ({ ...p, k: kurse.positionen?.[p.ticker] || null }));
    steuerungAufbauen();
    kopfAktualisieren();
    zeichnen();
  } catch (fehler) {
    inhalt.replaceChildren(el('p', 'hinweis hinweis-fehler',
      `Kursdaten konnten nicht geladen werden: ${fehler.message}. Der Abruf läuft viermal täglich; bei anhaltendem Fehler den Ablauf "Kurse aktualisieren" im Repository manuell starten.`));
    $('#datenstand').textContent = 'Daten nicht verfügbar';
  }
}

function kopfAktualisieren() {
  const zeit = fmtZeitpunkt(zustand.generiertAm);
  $('#datenstand').textContent = zeit ? `Datenstand ${zeit}` : 'Noch kein Abruf gelaufen';
}

// ----------------------------------------------------------- Steuerung

function steuerungAufbauen() {
  const rkBox = $('#rk-filter');
  for (const stufe of [1, 2, 3, 4, 5]) {
    const knopf = el('button', 'schalter', `RK ${stufe}`);
    knopf.type = 'button';
    knopf.setAttribute('aria-pressed', 'false');
    knopf.addEventListener('click', () => {
      zustand.rk.has(stufe) ? zustand.rk.delete(stufe) : zustand.rk.add(stufe);
      knopf.setAttribute('aria-pressed', String(zustand.rk.has(stufe)));
      zeichnen();
    });
    rkBox.append(knopf);
  }

  $('#suche').addEventListener('input', ereignis => {
    zustand.suche = ereignis.target.value.trim().toLowerCase();
    zeichnen();
  });

  $('#stufe').addEventListener('change', ereignis => {
    zustand.stufe = ereignis.target.value;
    zeichnen();
  });

  $('#sortierung').addEventListener('change', ereignis => {
    zustand.sortierung = ereignis.target.value;
    zeichnen();
  });

  for (const knopf of document.querySelectorAll('#ansicht-filter .schalter')) {
    knopf.setAttribute('aria-pressed', String(knopf.dataset.ansicht === zustand.ansicht));
    knopf.addEventListener('click', () => {
      zustand.ansicht = knopf.dataset.ansicht;
      for (const andere of document.querySelectorAll('#ansicht-filter .schalter')) {
        andere.setAttribute('aria-pressed', String(andere === knopf));
      }
      zeichnen();
    });
  }

  const praesentation = $('#praesentation');
  praesentation.addEventListener('click', () => {
    const an = document.body.classList.toggle('praesentation');
    praesentation.setAttribute('aria-pressed', String(an));
    zeichnen();
  });
}

// ------------------------------------------------------ Filter und Sortierung

function gefiltert() {
  return zustand.positionen.filter(p => {
    if (zustand.rk.size && !zustand.rk.has(p.rk)) return false;
    if (zustand.stufe !== 'alle' && p.k?.korrekturStufe !== zustand.stufe) return false;
    if (!zustand.suche) return true;
    return (p.name + ' ' + p.ticker).toLowerCase().includes(zustand.suche);
  });
}

function sortiert(liste) {
  const nachWert = (auswahl, richtung) => (a, b) => {
    const wa = auswahl(a), wb = auswahl(b);
    if (wa == null && wb == null) return a.name.localeCompare(b.name, 'de');
    if (wa == null) return 1;
    if (wb == null) return -1;
    return (wa - wb) * richtung || a.name.localeCompare(b.name, 'de');
  };

  const kopie = [...liste];
  switch (zustand.sortierung) {
    case 'korrektur': return kopie.sort(nachWert(p => p.k?.korrekturTiefe, 1));
    case 'dauer':     return kopie.sort(nachWert(p => p.k?.korrekturTage, -1));
    case 'rs':        return kopie.sort(nachWert(p => p.k?.relativeStaerke, -1));
    case 'name':      return kopie.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    default:
      return kopie.sort((a, b) =>
        SEKTOREN.indexOf(a.sektor) - SEKTOREN.indexOf(b.sektor) ||
        a.rk - b.rk ||
        a.name.localeCompare(b.name, 'de'));
  }
}

// ------------------------------------------------------------- Überblick

function uebersichtZeichnen(liste) {
  const mitDaten = liste.filter(p => p.k?.korrekturTiefe != null);
  const durchschnitt = mitDaten.length
    ? mitDaten.reduce((s, p) => s + p.k.korrekturTiefe, 0) / mitDaten.length
    : null;

  const felder = [
    ['Positionen', String(liste.length)],
    ['Unter −10 %', String(mitDaten.filter(p => p.k.korrekturTiefe <= -10).length)],
    ['Unter −20 %', String(mitDaten.filter(p => p.k.korrekturTiefe <= -20).length)],
    ['Ø Korrektur', durchschnitt == null ? NV : fmtProzent(Number(durchschnitt.toFixed(2)))],
    ['Am Hoch', String(mitDaten.filter(p => p.k.korrekturTiefe > -5).length)]
  ];

  const veraltet = liste.filter(p => p.k?.stale).length;
  if (veraltet) felder.push(['Ohne frische Daten', String(veraltet)]);

  const box = $('#uebersicht');
  box.replaceChildren(...felder.map(([titel, wert]) => {
    const feld = el('div');
    feld.append(el('span', 'kennzahl-titel', titel), el('span', 'kennzahl-wert zahl', wert));
    return feld;
  }));
}

// ------------------------------------------------------------- Zeichnen

function spaltenkopf(mitSektor) {
  const kopf = el('div', 'spaltenkopf');
  kopf.append(
    el('div'),
    el('div', null, mitSektor ? 'Wert und Sektor' : 'Wert'),
    el('div', null, 'Kurs'),
    el('div', null, 'Korrektur'),
    el('div', 'spalte-dauer', 'Dauer'),
    el('div', 'spalte-stufe', 'Stufe'),
    el('div', 'spalte-ma200', '200-Tage'),
    el('div', 'spalte-rs', 'Rel. Stärke'),
    el('div', 'spalte-spark', '12 Monate')
  );
  return kopf;
}

function zeichnen() {
  const liste = sortiert(gefiltert());
  uebersichtZeichnen(liste);

  if (!liste.length) {
    inhalt.replaceChildren(el('p', 'hinweis',
      'Keine Position passt zu den gewählten Filtern. Suche leeren oder Risikoklassen zurücksetzen.'));
    return;
  }

  inhalt.replaceChildren(
    zustand.ansicht === 'tabelle' ? flachZeichnen(liste) : nachSektorZeichnen(liste)
  );
}

function flachZeichnen(liste) {
  const rahmen = document.createDocumentFragment();
  rahmen.append(spaltenkopf(true));
  const box = el('div');
  for (const p of liste) box.append(positionZeichnen(p, true));
  rahmen.append(box);
  return rahmen;
}

function nachSektorZeichnen(liste) {
  const rahmen = document.createDocumentFragment();
  rahmen.append(spaltenkopf(false));

  for (const sektorName of SEKTOREN) {
    const imSektor = liste.filter(p => p.sektor === sektorName);
    if (!imSektor.length) continue;

    const abschnitt = el('section', 'sektor');
    const kopf = el('div', 'sektor-kopf');
    kopf.append(el('h2', null, sektorName));

    const etf = imSektor[0].benchmark;
    const etfPerf = zustand.benchmarks[etf]?.performance?.m6;
    kopf.append(el('span', 'sektor-meta',
      `${imSektor.length} ${imSektor.length === 1 ? 'Wert' : 'Werte'} · ${etf} 6 Monate ${fmtProzent(etfPerf)}`));
    abschnitt.append(kopf);

    for (const stufe of [1, 2, 3, 4, 5]) {
      const gruppe = imSektor.filter(p => p.rk === stufe);
      if (!gruppe.length) continue;

      const gruppenKopf = el('div', 'gruppe-kopf');
      gruppenKopf.style.setProperty('--rk-farbe', `var(--rk${stufe})`);
      gruppenKopf.append(el('span', 'gruppe-punkt'), el('span', null, `RK ${stufe} — ${gruppe[0].rkLabel}`));
      abschnitt.append(gruppenKopf);

      for (const p of gruppe) abschnitt.append(positionZeichnen(p, false));
    }
    rahmen.append(abschnitt);
  }
  return rahmen;
}

function positionZeichnen(p, mitSektor) {
  const k = p.k;
  const wrapper = el('div', 'position');
  wrapper.style.setProperty('--rk-farbe', `var(--rk${p.rk})`);

  const zeile = el('button', 'zeile');
  zeile.type = 'button';
  zeile.setAttribute('aria-expanded', String(zustand.offen === p.ticker));

  const untertitel = mitSektor ? `${p.ticker} · ${p.sektor} · RK ${p.rk}` : p.ticker;

  zeile.append(
    el('div', 'rk-balken'),
    zelle('spalte-wert', p.name, 'wert-name', untertitel, 'wert-meta'),
    zelle('spalte-kurs zahl', fmtKurs(k?.kurs, k?.waehrung || p.waehrung), 'kurs-wert',
      fmtProzent(k?.veraenderungTag), `kurs-tag zahl ${vorzeichenKlasse(k?.veraenderungTag)}`),
    el('div', `spalte-korrektur korrektur zahl ${vorzeichenKlasse(k?.korrekturTiefe)}`,
      fmtProzent(k?.korrekturTiefe)),
    zelle('spalte-dauer zahl',
      k?.korrekturTage == null ? NV : `${f0.format(k.korrekturTage)} Tage`, 'dauer-wert',
      k?.korrekturMonate == null ? '' : `${f1.format(k.korrekturMonate)} Monate`, 'dauer-meta zahl'),
    stufenZelle(k?.korrekturStufe),
    el('div', `spalte-ma200 zahl ${vorzeichenKlasse(k?.abstandMa200)}`, fmtProzent(k?.abstandMa200)),
    el('div', `spalte-rs zahl ${vorzeichenKlasse(k?.relativeStaerke)}`, fmtPunkte(k?.relativeStaerke)),
    sparkZelle(k)
  );

  zeile.addEventListener('click', () => {
    zustand.offen = zustand.offen === p.ticker ? null : p.ticker;
    zeichnen();
    if (zustand.offen === p.ticker) {
      requestAnimationFrame(() => {
        const ziel = [...document.querySelectorAll('.zeile')]
          .find(z => z.getAttribute('aria-expanded') === 'true');
        ziel?.focus();
      });
    }
  });

  wrapper.append(zeile);
  if (zustand.offen === p.ticker) wrapper.append(detailZeichnen(p));
  return wrapper;
}

function stufenZelle(stufe) {
  const box = el('div', 'spalte-stufe');
  if (!stufe) { box.append(el('span', 'leer', NV)); return box; }
  box.append(el('span', 'stufe', stufe));
  return box;
}

function sparkZelle(k) {
  const box = el('div', 'spalte-spark');
  if (!k?.spark?.length) { box.append(el('span', 'leer', NV)); return box; }

  const punkte = k.spark;
  const breite = 100, hoehe = 30, rand = 3;
  const x = i => (i / (punkte.length - 1)) * breite;
  const y = w => hoehe - rand - w * (hoehe - 2 * rand);
  const linie = punkte.map((w, i) => `${x(i).toFixed(2)},${y(w).toFixed(2)}`).join(' ');
  const farbe = punkte.at(-1) >= punkte[0] ? 'var(--positiv)' : 'var(--negativ)';

  box.innerHTML =
    `<svg class="spark" viewBox="0 0 ${breite} ${hoehe}" preserveAspectRatio="none" aria-hidden="true">` +
    `<polygon points="0,${hoehe} ${linie} ${breite},${hoehe}" fill="${farbe}" opacity="0.14"></polygon>` +
    `<polyline points="${linie}" fill="none" stroke="${farbe}" stroke-width="1.2" ` +
    `vector-effect="non-scaling-stroke" stroke-linejoin="round"></polyline></svg>`;
  return box;
}

// ---------------------------------------------------------------- Detail

function detailZeichnen(p) {
  const k = p.k;
  const box = el('div', 'detail');

  const links = el('div');
  if (k?.chart?.c?.length) {
    links.append(detailChart(k));
    links.append(el('p', 'legende',
      'Durchgezogen: Kursverlauf drei Jahre. Waagerecht hell: 52-Wochen-Hoch. Waagerecht gestrichelt: 200-Tage-Durchschnitt.'));
  } else {
    links.append(el('p', 'hinweis', k?.fehler
      ? `Kein Kursverlauf verfügbar. Letzte Meldung des Anbieters: ${k.fehler}`
      : 'Kein Kursverlauf verfügbar.'));
  }

  const rechts = el('div');
  const tabelle = el('table', 'detail-tabelle');
  const zeilen = [
    ['1 Monat', fmtProzent(k?.performance?.m1), k?.performance?.m1],
    ['3 Monate', fmtProzent(k?.performance?.m3), k?.performance?.m3],
    ['6 Monate', fmtProzent(k?.performance?.m6), k?.performance?.m6],
    ['Seit Jahresbeginn', fmtProzent(k?.performance?.ytd), k?.performance?.ytd],
    ['1 Jahr', fmtProzent(k?.performance?.j1), k?.performance?.j1],
    ['52-Wochen-Hoch', k?.hoch52w ? `${fmtKurs(k.hoch52w.kurs, k.waehrung || p.waehrung)} am ${fmtDatum(k.hoch52w.datum)}` : NV, null],
    ['5-Jahres-Hoch', k?.hoch5j ? `${fmtKurs(k.hoch5j.kurs, k.waehrung || p.waehrung)} am ${fmtDatum(k.hoch5j.datum)}` : NV, null],
    ['Korrektur zum 5-Jahres-Hoch', fmtProzent(k?.korrekturTiefe5j), k?.korrekturTiefe5j],
    ['200-Tage-Durchschnitt', fmtKurs(k?.ma200, k?.waehrung || p.waehrung), null],
    [`Relative Stärke gegen ${p.benchmark}`, fmtPunkte(k?.relativeStaerke), k?.relativeStaerke],
    ['Kursstand vom', fmtDatum(k?.kursDatum), null]
  ];

  for (const [titel, wert, vergleich] of zeilen) {
    const tr = el('tr');
    tr.append(el('th', null, titel));
    tr.append(el('td', `zahl ${vergleich === null ? '' : vorzeichenKlasse(vergleich)}`, wert));
    tabelle.append(tr);
  }
  rechts.append(tabelle);

  if (p.notiz) rechts.append(el('p', 'detail-notiz', p.notiz));
  if (k?.stale) {
    rechts.append(el('p', 'detail-notiz veraltet',
      `Letzter erfolgreicher Abruf: ${fmtZeitpunkt(k.abgerufenAm) || 'unbekannt'}. Angezeigt werden die zuletzt bekannten Werte.`));
  }

  box.append(links, rechts);
  return box;
}

function detailChart(k) {
  const werte = k.chart.c.filter(w => w != null);
  const datumsliste = k.chart.d;
  const breite = 760, hoehe = 240, obenRand = 12, untenRand = 26, linksRand = 0, rechtsRand = 58;

  const linien = [k.ma200, k.hoch52w?.kurs].filter(w => w != null);
  const min = Math.min(...werte, ...linien);
  const max = Math.max(...werte, ...linien);
  const spanne = (max - min) || 1;

  const x = i => linksRand + (i / (werte.length - 1)) * (breite - linksRand - rechtsRand);
  const y = w => obenRand + (1 - (w - min) / spanne) * (hoehe - obenRand - untenRand);

  const pfad = werte.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(w).toFixed(1)}`).join(' ');
  const teile = [];

  // Jahreswechsel als senkrechte Hilfslinien
  for (let i = 1; i < datumsliste.length; i++) {
    if (datumsliste[i].slice(0, 4) !== datumsliste[i - 1].slice(0, 4)) {
      teile.push(`<line x1="${x(i).toFixed(1)}" y1="${obenRand}" x2="${x(i).toFixed(1)}" y2="${hoehe - untenRand}" stroke="var(--linie)" stroke-width="1"></line>`);
      teile.push(`<text x="${(x(i) + 4).toFixed(1)}" y="${hoehe - untenRand + 15}" fill="var(--text-drei)" font-size="11">${datumsliste[i].slice(0, 4)}</text>`);
    }
  }

  if (k.hoch52w?.kurs != null) {
    teile.push(`<line x1="0" y1="${y(k.hoch52w.kurs).toFixed(1)}" x2="${breite - rechtsRand}" y2="${y(k.hoch52w.kurs).toFixed(1)}" stroke="var(--linie-stark)" stroke-width="1"></line>`);
    teile.push(`<text x="${breite - rechtsRand + 6}" y="${(y(k.hoch52w.kurs) + 4).toFixed(1)}" fill="var(--text-zwei)" font-size="11">52W-Hoch</text>`);
  }
  if (k.ma200 != null) {
    teile.push(`<line x1="0" y1="${y(k.ma200).toFixed(1)}" x2="${breite - rechtsRand}" y2="${y(k.ma200).toFixed(1)}" stroke="var(--text-drei)" stroke-width="1" stroke-dasharray="4 4"></line>`);
    teile.push(`<text x="${breite - rechtsRand + 6}" y="${(y(k.ma200) + 4).toFixed(1)}" fill="var(--text-zwei)" font-size="11">200 Tage</text>`);
  }

  teile.push(`<path d="${pfad}" fill="none" stroke="var(--text)" stroke-width="1.4" stroke-linejoin="round"></path>`);

  const box = el('div');
  box.innerHTML = `<svg class="detail-chart" viewBox="0 0 ${breite} ${hoehe}" role="img" ` +
    `aria-label="Kursverlauf über drei Jahre">${teile.join('')}</svg>`;
  return box;
}

start();
