const SEKTOREN = [
  'Information Technology', 'Communication Services', 'Consumer Discretionary',
  'Consumer Staples', 'Health Care', 'Financials', 'Industrials',
  'Materials', 'Energy', 'Utilities', 'Real Estate'
];

const NV = 'n. v.';

const zustand = {
  positionen: [], benchmarks: {}, generiertAm: null,
  suche: '', rk: new Set(), stufe: 'alle', sortierung: 'sektor',
  ansicht: 'sektor', offen: null, intervall: 'tag', chartArt: 'kerzen'
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

const fmtZahl = wert => (wert == null ? NV : f2.format(wert));

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
  box.append(el('div', obenKlasse, oben));
  if (unten != null) box.append(el('div', untenKlasse, unten));
  return box;
}

// Kürzel aus dem Firmennamen für die Ersatzkachel.
function monogramm(name) {
  const teile = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!teile.length) return '?';
  if (teile.length === 1) return teile[0][0].toUpperCase();
  return (teile[0][0] + teile[1][0]).toUpperCase();
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

  $('#suche').addEventListener('input', e => { zustand.suche = e.target.value.trim().toLowerCase(); zeichnen(); });
  $('#stufe').addEventListener('change', e => { zustand.stufe = e.target.value; zeichnen(); });
  $('#sortierung').addEventListener('change', e => { zustand.sortierung = e.target.value; zeichnen(); });

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
        a.rk - b.rk || a.name.localeCompare(b.name, 'de'));
  }
}

// ------------------------------------------------------------- Überblick

function uebersichtZeichnen(liste) {
  const mitDaten = liste.filter(p => p.k?.korrekturTiefe != null);
  const durchschnitt = mitDaten.length
    ? mitDaten.reduce((s, p) => s + p.k.korrekturTiefe, 0) / mitDaten.length : null;

  const felder = [
    ['Positionen', String(liste.length)],
    ['Unter −10 %', String(mitDaten.filter(p => p.k.korrekturTiefe <= -10).length)],
    ['Unter −20 %', String(mitDaten.filter(p => p.k.korrekturTiefe <= -20).length)],
    ['Ø Korrektur', durchschnitt == null ? NV : fmtProzent(Number(durchschnitt.toFixed(2)))],
    ['Am Hoch', String(mitDaten.filter(p => p.k.korrekturTiefe > -5).length)]
  ];

  const veraltet = liste.filter(p => p.k?.stale).length;
  if (veraltet) felder.push(['Ohne frische Daten', String(veraltet)]);

  $('#uebersicht').replaceChildren(...felder.map(([titel, wert]) => {
    const feld = el('div');
    feld.append(el('span', 'kennzahl-titel', titel), el('span', 'kennzahl-wert zahl', wert));
    return feld;
  }));
}

// ------------------------------------------------------------- Zeichnen

function spaltenkopf(mitSektor) {
  const kopf = el('div', 'spaltenkopf');
  kopf.append(
    el('div'), el('div'),
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

// Kachel mit Kürzel; ein vorhandenes Logo legt sich beim Laden darüber.
function logoZelle(p) {
  const box = el('div', 'spalte-logo');
  const kachel = el('div', 'logo');
  kachel.append(el('span', 'logo-kuerzel', monogramm(p.name)));

  const bild = new Image();
  bild.alt = '';
  bild.className = 'logo-bild';
  bild.loading = 'lazy';
  bild.addEventListener('load', () => kachel.classList.add('logo-mit-bild'));
  bild.addEventListener('error', () => bild.remove());
  bild.src = `assets/logos/${encodeURIComponent(p.logo || p.ticker + '.png')}`;
  kachel.append(bild);

  box.append(kachel);
  return box;
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
    logoZelle(p),
    zelle('spalte-wert', p.name, 'wert-name', untertitel, 'wert-meta'),
    zelle('spalte-kurs zahl', fmtKurs(k?.kurs, k?.waehrung || p.waehrung), 'kurs-wert',
      fmtProzent(k?.veraenderungTag), `kurs-tag zahl ${vorzeichenKlasse(k?.veraenderungTag)}`),
    el('div', `spalte-korrektur korrektur zahl ${vorzeichenKlasse(k?.korrekturTiefe)}`, fmtProzent(k?.korrekturTiefe)),
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
    if (zustand.offen === p.ticker) fokusAufOffene();
  });

  wrapper.append(zeile);
  if (zustand.offen === p.ticker) wrapper.append(detailZeichnen(p));
  return wrapper;
}

function fokusAufOffene() {
  requestAnimationFrame(() => {
    [...document.querySelectorAll('.zeile')]
      .find(z => z.getAttribute('aria-expanded') === 'true')?.focus();
  });
}

function stufenZelle(stufe) {
  const box = el('div', 'spalte-stufe');
  box.append(stufe ? el('span', 'stufe', stufe) : el('span', 'leer', NV));
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

const INTERVALLE = [['tag', 'Tage'], ['woche', 'Wochen'], ['monat', 'Monate']];
const ARTEN = [['kerzen', 'Kerzen'], ['linie', 'Linie']];

function schalterGruppe(eintraege, aktiv, beiWahl, beschriftung) {
  const box = el('div', 'schalterreihe');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', beschriftung);
  for (const [wert, text] of eintraege) {
    const knopf = el('button', 'schalter schalter-klein', text);
    knopf.type = 'button';
    knopf.setAttribute('aria-pressed', String(wert === aktiv));
    knopf.addEventListener('click', ereignis => { ereignis.stopPropagation(); beiWahl(wert); });
    box.append(knopf);
  }
  return box;
}

function detailZeichnen(p) {
  const k = p.k;
  const box = el('div', 'detail');

  const links = el('div', 'detail-chartbereich');
  const leiste = el('div', 'chart-leiste');
  leiste.append(
    schalterGruppe(INTERVALLE, zustand.intervall, wert => {
      zustand.intervall = wert; zeichnen(); fokusAufOffene();
    }, 'Zeitraster'),
    schalterGruppe(ARTEN, zustand.chartArt, wert => {
      zustand.chartArt = wert; zeichnen(); fokusAufOffene();
    }, 'Darstellungsart')
  );
  links.append(leiste);

  const kerzen = k?.kerzen?.[zustand.intervall];
  if (kerzen?.c?.length) {
    links.append(kursChart(kerzen, k));
    links.append(el('p', 'legende', zustand.intervall === 'tag'
      ? 'Tageskerzen der letzten sechs Monate. Waagerecht hell: 52-Wochen-Hoch, gestrichelt: 200-Tage-Durchschnitt.'
      : zustand.intervall === 'woche'
        ? 'Wochenkerzen der letzten drei Jahre. Waagerecht hell: 52-Wochen-Hoch, gestrichelt: 200-Tage-Durchschnitt.'
        : 'Monatskerzen der letzten fünf Jahre. Waagerecht hell: 52-Wochen-Hoch, gestrichelt: 200-Tage-Durchschnitt.'));
  } else {
    links.append(el('p', 'hinweis', k?.fehler
      ? `Kein Kursverlauf verfügbar. Letzte Meldung des Anbieters: ${k.fehler}`
      : 'Kein Kursverlauf verfügbar.'));
  }

  const rechts = el('div');
  rechts.append(kennzahlenTabelle(p, k));
  rechts.append(termineBlock(k?.termine, Boolean(p.mic)));
  if (p.notiz) rechts.append(el('p', 'detail-notiz', p.notiz));
  if (k?.stale) {
    rechts.append(el('p', 'detail-notiz veraltet',
      `Letzter erfolgreicher Abruf: ${fmtZeitpunkt(k.abgerufenAm) || 'unbekannt'}. Angezeigt werden die zuletzt bekannten Werte.`));
  }

  box.append(links, rechts);
  return box;
}

function kennzahlenTabelle(p, k) {
  const waehrung = k?.waehrung || p.waehrung;
  const tabelle = el('table', 'detail-tabelle');
  const zeilen = [
    ['1 Monat', fmtProzent(k?.performance?.m1), k?.performance?.m1],
    ['3 Monate', fmtProzent(k?.performance?.m3), k?.performance?.m3],
    ['6 Monate', fmtProzent(k?.performance?.m6), k?.performance?.m6],
    ['Seit Jahresbeginn', fmtProzent(k?.performance?.ytd), k?.performance?.ytd],
    ['1 Jahr', fmtProzent(k?.performance?.j1), k?.performance?.j1],
    ['52-Wochen-Hoch', k?.hoch52w ? `${fmtKurs(k.hoch52w.kurs, waehrung)} am ${fmtDatum(k.hoch52w.datum)}` : NV, null],
    ['5-Jahres-Hoch', k?.hoch5j ? `${fmtKurs(k.hoch5j.kurs, waehrung)} am ${fmtDatum(k.hoch5j.datum)}` : NV, null],
    ['Korrektur zum 5-Jahres-Hoch', fmtProzent(k?.korrekturTiefe5j), k?.korrekturTiefe5j],
    ['200-Tage-Durchschnitt', fmtKurs(k?.ma200, waehrung), null],
    [`Relative Stärke gegen ${p.benchmark}`, fmtPunkte(k?.relativeStaerke), k?.relativeStaerke],
    ['Kursstand vom', fmtDatum(k?.kursDatum), null]
  ];

  for (const [titel, wert, vergleich] of zeilen) {
    const tr = el('tr');
    tr.append(el('th', null, titel));
    tr.append(el('td', `zahl ${vergleich === null ? '' : vorzeichenKlasse(vergleich)}`, wert));
    tabelle.append(tr);
  }
  return tabelle;
}

function termineBlock(termine, istAusland) {
  const box = el('div', 'termine');
  box.append(el('h3', 'termine-titel', 'Quartalszahlen'));

  if (!termine) {
    box.append(el('p', 'termine-leer', istAusland
      ? 'Termine sind derzeit nur für US-Notierungen verfügbar.'
      : 'Keine Termindaten vorhanden.'));
    return box;
  }

  const tabelle = el('table', 'detail-tabelle');
  const zeilen = [];

  if (termine.naechster) {
    const n = termine.naechster;
    zeilen.push(['Nächster Bericht',
      `${fmtDatum(n.datum)}${n.quartal ? ` · ${n.quartal}` : ''}`, null]);
    if (n.epsErwartet != null) zeilen.push(['Erwartetes Ergebnis je Aktie', fmtZahl(n.epsErwartet), null]);
    const tage = Math.round((new Date(n.datum) - Date.now()) / 86400000);
    if (Number.isFinite(tage) && tage >= 0) zeilen.push(['Verbleibend', `${f0.format(tage)} Tage`, null]);
  }

  if (termine.letzter) {
    const l = termine.letzter;
    zeilen.push(['Letzter Bericht', fmtDatum(l.datum), null]);
    zeilen.push(['Erwartet / gemeldet',
      `${fmtZahl(l.epsErwartet)} / ${fmtZahl(l.epsGemeldet)}`, null]);
    if (l.abweichung != null) zeilen.push(['Abweichung', fmtProzent(l.abweichung), l.abweichung]);
  }

  for (const [titel, wert, vergleich] of zeilen) {
    const tr = el('tr');
    tr.append(el('th', null, titel));
    tr.append(el('td', `zahl ${vergleich === null ? '' : vorzeichenKlasse(vergleich)}`, wert));
    tabelle.append(tr);
  }
  box.append(tabelle);
  return box;
}

// ------------------------------------------------------------- Kursgrafik

function kursChart(kerzen, k) {
  const anzahl = kerzen.c.length;
  const breite = 760, hoehe = 260;
  const oben = 12, unten = 28, rechts = 62;

  const linien = [k.ma200, k.hoch52w?.kurs].filter(w => w != null);
  const min = Math.min(...kerzen.l.filter(Number.isFinite), ...linien);
  const max = Math.max(...kerzen.h.filter(Number.isFinite), ...linien);
  const spanne = (max - min) || 1;

  const nutzBreite = breite - rechts;
  const schritt = nutzBreite / anzahl;
  const x = i => (i + 0.5) * schritt;
  const y = w => oben + (1 - (w - min) / spanne) * (hoehe - oben - unten);

  const teile = [];

  // Jahreswechsel als senkrechte Hilfslinien
  for (let i = 1; i < anzahl; i++) {
    if (kerzen.d[i].slice(0, 4) !== kerzen.d[i - 1].slice(0, 4)) {
      teile.push(`<line x1="${x(i).toFixed(1)}" y1="${oben}" x2="${x(i).toFixed(1)}" y2="${hoehe - unten}" stroke="var(--linie)"></line>`);
      teile.push(`<text x="${(x(i) + 4).toFixed(1)}" y="${hoehe - unten + 15}" fill="var(--text-drei)" font-size="11">${kerzen.d[i].slice(0, 4)}</text>`);
    }
  }

  const marke = (wert, farbe, strich, text) => {
    if (wert == null) return;
    const yy = y(wert).toFixed(1);
    teile.push(`<line x1="0" y1="${yy}" x2="${nutzBreite}" y2="${yy}" stroke="${farbe}"${strich}></line>`);
    teile.push(`<text x="${nutzBreite + 6}" y="${(y(wert) + 4).toFixed(1)}" fill="var(--text-zwei)" font-size="11">${text}</text>`);
  };
  marke(k.hoch52w?.kurs, 'var(--linie-stark)', '', '52W-Hoch');
  marke(k.ma200, 'var(--text-drei)', ' stroke-dasharray="4 4"', '200 Tage');

  if (zustand.chartArt === 'linie') {
    const pfad = kerzen.c.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(w).toFixed(1)}`).join(' ');
    teile.push(`<path d="${pfad}" fill="none" stroke="var(--text)" stroke-width="1.4" stroke-linejoin="round"></path>`);
  } else {
    const koerperBreite = Math.max(1.2, Math.min(9, schritt * 0.62));
    for (let i = 0; i < anzahl; i++) {
      const o = kerzen.o[i], h = kerzen.h[i], l = kerzen.l[i], c = kerzen.c[i];
      if (![o, h, l, c].every(Number.isFinite)) continue;
      const farbe = c >= o ? 'var(--positiv)' : 'var(--negativ)';
      const xm = x(i);
      teile.push(`<line x1="${xm.toFixed(1)}" y1="${y(h).toFixed(1)}" x2="${xm.toFixed(1)}" y2="${y(l).toFixed(1)}" stroke="${farbe}" stroke-width="1"></line>`);
      const yo = y(Math.max(o, c)), yc = y(Math.min(o, c));
      teile.push(`<rect x="${(xm - koerperBreite / 2).toFixed(1)}" y="${yo.toFixed(1)}" width="${koerperBreite.toFixed(1)}" height="${Math.max(1, yc - yo).toFixed(1)}" fill="${farbe}"></rect>`);
    }
  }

  // Preisachse rechts
  for (const anteil of [0, 0.5, 1]) {
    const wert = min + spanne * anteil;
    teile.push(`<text x="${nutzBreite + 6}" y="${(y(wert) + 4).toFixed(1)}" fill="var(--text-drei)" font-size="10">${f2.format(wert)}</text>`);
  }

  const box = el('div');
  box.innerHTML = `<svg class="detail-chart" viewBox="0 0 ${breite} ${hoehe}" role="img" ` +
    `aria-label="Kursverlauf, ${anzahl} Werte">${teile.join('')}</svg>`;
  return box;
}

start();
