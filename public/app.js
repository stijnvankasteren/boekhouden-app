
// --- Globale UI state
let drawerTx = null;
let drawerEditMode = false;
const bookingIndexById = new Map();

// --- Pure frontend storage shim (vervangt de backend API) ---
(function () {
  const LS = {
    tx: 'boekhouden_transactions_v1',
    settings: 'boekhouden_settings_v1',
    sheetPrefix: 'boekhouden_sheet_',
  };

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // Canonicaliseer transactietype naar vaste waarden: PASSIVA / KOSTEN / OPBRENGSTEN
  function canonType(t) {
    const s = (t || '').toString().trim().toLowerCase();
    if (!s) return '';
    if (s === 'income' || s.startsWith('ink') || s.includes('omzet') || s.includes('verkoop')) return 'OPBRENGSTEN';
    if (s === 'expense' || s.startsWith('uitg') || s.startsWith('kost') || s.includes('kosten')) return 'KOSTEN';
    if (s.startsWith('pass')) return 'PASSIVA';
    if (s.startsWith('kost')) return 'KOSTEN';
    if (s.startsWith('opbr')) return 'OPBRENGSTEN';
    if (s === 'passiva') return 'PASSIVA';
    if (s === 'kosten') return 'KOSTEN';
    if (s === 'opbrengsten') return 'OPBRENGSTEN';
    return s.toUpperCase();
  }

  function calcSummary(transactions) {
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const t of transactions || []) {
      const amt = Number(t.amount) || 0;
      const tt = canonType(t.type);
      if (tt === 'KOSTEN') totalExpenses += amt;
      else if (tt === 'OPBRENGSTEN') totalIncome += amt;
      // PASSIVA telt niet mee in W/V
    }
    return { totalIncome, totalExpenses, result: totalIncome - totalExpenses };
  }

  function uid() {
    // simpele id (voldoende voor lokaal gebruik)
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  }

  function defaultSheetHtml(view) {
    const tpl = document.getElementById('tpl-' + view);
    if (!tpl) return null;
    return tpl.innerHTML;
  }

  // Intercept fetch calls to /api/*
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const method = (init && init.method ? init.method : 'GET').toUpperCase();

    if (!url.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    const jsonResponse = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

    // SETTINGS
    if (url === '/api/settings') {
      if (method === 'GET') {
        const settings = readJSON(LS.settings, {});
        return jsonResponse(settings);
      }
      if (method === 'POST' || method === 'PUT') {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const current = readJSON(LS.settings, {});
        const merged = { ...current, ...body };
        writeJSON(LS.settings, merged);
        return jsonResponse({ ok: true, settings: merged });
      }
    }

    // TRANSACTIONS
    if (url === '/api/transactions' && method === 'GET') {
      let transactions = readJSON(LS.tx, []);
      // Migratie: zet legacy income/expense om naar OPBRENGSTEN/KOSTEN en schrijf terug.
      let changed = false;
      transactions = (transactions || []).map((t) => {
        const tt = canonType(t && t.type);
        if (t && tt && t.type !== tt) changed = true;
        return {
          ...(t || {}),
          type: tt || (t && t.type) || '',
          amount: Number(t && t.amount) || 0,
          vatRate: Number(t && (t.vatRate ?? t.vat_rate ?? 0)) || 0,
        };
      });
      if (changed) writeJSON(LS.tx, transactions);
      return jsonResponse({ transactions, summary: calcSummary(transactions) });
    }

    if (url === '/api/transactions' && method === 'POST') {
      const body = init && init.body ? JSON.parse(init.body) : {};
      const transactions = readJSON(LS.tx, []);
      const tx = {
        id: uid(),
        date: body.date || '',
        description: body.description || '',
        amount: Number(body.amount) || 0,
        vatRate: Number(body.vatRate ?? 0) || 0,
        type: canonType(body.type) || 'KOSTEN',
        category: body.category || '',
        paymentMethod: body.paymentMethod || '',
        attachmentName: body.attachmentName,
        attachmentData: body.attachmentData,
      };
      transactions.unshift(tx);
      writeJSON(LS.tx, transactions);
      return jsonResponse({ ok: true, transaction: tx, summary: calcSummary(transactions) }, 201);
    }

    const txIdMatch = url.match(/^\/api\/transactions\/([^/?#]+)$/);
    if (txIdMatch) {
      const id = decodeURIComponent(txIdMatch[1]);
      const transactions = readJSON(LS.tx, []);

      if (method === 'DELETE') {
        const next = transactions.filter((t) => t.id !== id);
        writeJSON(LS.tx, next);
        return jsonResponse({ ok: true, summary: calcSummary(next) });
      }

      if (method === 'PUT' || method === 'PATCH') {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const next = transactions.map((t) => {
          if (t.id !== id) return t;
          return {
            ...t,
            ...body,
            type: body && Object.prototype.hasOwnProperty.call(body, 'type') ? (canonType(body.type) || t.type) : t.type,
            amount: Number(body.amount ?? t.amount) || 0,
            vatRate: Number(body.vatRate ?? t.vatRate) || 0,
          };
        });
        writeJSON(LS.tx, next);
        return jsonResponse({ ok: true, summary: calcSummary(next) });
      }
    }

    // SHEETS
    const sheetMatch = url.match(/^\/api\/sheets\/([^/?#]+)$/);
    if (sheetMatch) {
      const view = decodeURIComponent(sheetMatch[1]);
      const key = LS.sheetPrefix + view;

      if (method === 'GET') {
        const html = localStorage.getItem(key) || defaultSheetHtml(view);
        return jsonResponse({ html: html || '' });
      }

      if (method === 'PUT' || method === 'POST') {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const html = body.html || '';
        localStorage.setItem(key, html);
        return jsonResponse({ ok: true });
      }
    }

    return jsonResponse({ error: 'Not found' }, 404);
  };
})();


let currentView = 'dashboard';
let lastData = {
  transactions: [],
  summary: { totalIncome: 0, totalExpenses: 0, result: 0 },
};

// Huidig geselecteerde jaar voor de weergave.  'all' betekent dat alle
// transacties worden meegenomen.  De lijst van beschikbare jaren wordt
// dynamisch gevuld op basis van de aanwezige transacties.
let currentYearFilter = 'all';

// Laatste samenvatting voor de gefilterde transacties.  Deze wordt
// geüpdatet telkens wanneer de jaarfilter verandert of wanneer transacties
// opnieuw worden geladen.  Met deze variabele kan de winst/verlies en
// btw-tabellen worden bijgewerkt zonder opnieuw te rekenen in verschillende
// functies.
let lastFilteredSummary = null;
let lastFilteredTransactions = [];

// Modal / edit state
let editingTxId = null;
let attachmentTxId = null;

// Open a stored data-url attachment reliably.
// Some browsers block opening long `data:` URLs directly (showing about:blank).
async function openAttachmentDataUrl(dataUrl, filename) {
  // Legacy helper: open attachment in the attachment popup instead of a new tab.
  openAttachmentModal({ id: null, attachmentData: dataUrl, attachmentName: filename || 'Bijlage' }, true);
}

let attachmentModalTxId = null;

// Voeg (eenmalig) standaard kosten-categorieën toe aan de categorieën-sheet.
// Dit zorgt ervoor dat nieuwe installaties én bestaande installaties (zonder reset)
// de lijst uit de grootboek-categorieën meteen beschikbaar hebben.
function ensureDefaultKostenCategoriesSeed() {
  const FLAG = 'boekhouden_seed_kosten_categories_v1';
  if (localStorage.getItem(FLAG) === '1') return;

  const KEY = 'boekhouden_sheet_categories';

  const defaults = [
    '4500 Huisvestingskosten',
    '4600 Autokosten',
    '4640 Kilometervergoeding',
    '4700 Reclame en advertenties',
    '4730 Relatiegeschenken',
    '4740 Reis- en verblijfkosten',
    '4742 Representatie en verteer',
    '4790 Overige verkoopkosten',
    '4800 Afschrijvingskosten',
    '4900 Telefoon en internet',
    '4910 Contributies en abonnementen',
    '4915 Cursussen/seminars',
    '4920 Verzekeringen',
    '4930 Kantoorbenodigdheden',
    '4931 Kleine aanschaf kantoor',
    '4932 Vakliteratuur',
    '4933 Software',
    '4940 Accountants- en administratiekosten',
    '4950 Drukwerk, porti en vrachten',
    '4960 Branche-organisatiekosten',
    '4980 Bankkosten',
    '4990 Overige algemene kosten',
    '7000 Inkopen',
    '7100 Uitbesteed werk',
    '9090 Rente baten',
    '9190 Rente lasten',
    '9300 Betalingsverschillen',
  ];

  // Haal huidige html op (opgeslagen of template-default)
  let html = localStorage.getItem(KEY);
  if (!html) {
    const tpl = document.getElementById('tpl-categories');
    html = tpl ? tpl.innerHTML : '';
  }
  if (!html) {
    localStorage.setItem(FLAG, '1');
    return;
  }

  const doc = new DOMParser().parseFromString(`<div id="_wrap">${html}</div>`, 'text/html');
  const tbody = doc.querySelector('#_wrap #category-table tbody');
  if (!tbody) {
    localStorage.setItem(FLAG, '1');
    return;
  }

  // Bestaande namen
  const existing = new Set(
    Array.from(tbody.querySelectorAll('tr td:first-child'))
      .map((td) => (td.textContent || '').trim())
      .filter(Boolean)
  );

  // Normaliseer legacy types (inkomst/uitgave) naar nieuwe labels
  for (const tr of Array.from(tbody.querySelectorAll('tr'))) {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 2) continue;
    const raw = (tds[1].textContent || '').trim().toLowerCase();
    if (raw === 'uitgave') tds[1].textContent = 'KOSTEN';
    if (raw === 'inkomst') tds[1].textContent = 'OPBRENGSTEN';
  }

  // Voeg ontbrekende defaults toe als KOSTEN
  for (const name of defaults) {
    if (existing.has(name)) continue;
    const tr = doc.createElement('tr');
    tr.innerHTML = `<td>${name}</td><td>KOSTEN</td><td></td><td></td>`;
    tbody.appendChild(tr);
  }

  const wrap = doc.querySelector('#_wrap');
  localStorage.setItem(KEY, wrap ? wrap.innerHTML : html);
  localStorage.setItem(FLAG, '1');
}

function openAttachmentModal(tx, viewOnly = false) {
  const overlay = document.getElementById('attModal');
  if (!overlay) return;

  attachmentModalTxId = tx && tx.id ? tx.id : null;

  const meta = document.getElementById('attModalMeta');
  const title = document.getElementById('attModalTitle');
  if (title) title.textContent = 'Bon / factuur';
  if (meta) meta.textContent = tx && tx.description ? tx.description : '';

  const empty = document.getElementById('attModalEmpty');
  const previewWrap = document.getElementById('attModalPreview');
  const frame = document.getElementById('attPreviewFrame');
  const dl = document.getElementById('attDownloadLink');
  const removeBtn = document.getElementById('attRemoveBtn');

  const has = !!(tx && tx.attachmentData);

  if (empty) empty.classList.toggle('hidden', has);
  if (previewWrap) previewWrap.classList.toggle('hidden', !has);

  if (frame) frame.innerHTML = '';
  if (dl) {
    dl.href = has ? tx.attachmentData : '#';
    dl.download = (tx && tx.attachmentName) ? tx.attachmentName : 'bijlage';
    dl.classList.toggle('hidden', !has);
  }
  if (removeBtn) removeBtn.classList.toggle('hidden', viewOnly || !has);

  if (has && frame) {
    const dataUrl = tx.attachmentData;
    const name = tx.attachmentName || 'Bijlage';
    const lower = name.toLowerCase();
    if (lower.endsWith('.pdf') || dataUrl.startsWith('data:application/pdf')) {
      const iframe = document.createElement('iframe');
      iframe.src = dataUrl;
      iframe.title = name;
      frame.appendChild(iframe);
    } else {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = name;
      frame.appendChild(img);
    }
  }

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeAttachmentModal() {
  const overlay = document.getElementById('attModal');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  attachmentModalTxId = null;
}

async function saveAttachmentToTx(txId, file) {
  if (!txId || !file) return;
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('File read failed'));
    r.readAsDataURL(file);
  });

  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;
  tx.attachmentData = dataUrl;
  tx.attachmentName = file.name || 'Bijlage';

  await saveTransactions();
  renderCurrentView();
  // If drawer is open for this tx, update it
  if (drawerTx && drawerTx.id === txId) {
    drawerTx.attachmentData = tx.attachmentData;
    drawerTx.attachmentName = tx.attachmentName;
    renderTxDrawer();
  }
  openAttachmentModal(tx);
}

// The currently loaded settings.  Updated whenever loadSettings runs.  Used
// throughout the UI to adapt text (e.g. displaying the chosen year).
let currentSettings = null;

// Layout editing state and drag references
let isLayoutEditMode = false;
let draggedNavItem = null;
let draggedPanelItem = null;

const sheetCache = {};

/**
 * Vul het select-element voor categorieën (in het formulier) met de
 * categorieën uit de instellingen.  De keuzelijst past zich aan op basis
 * van het geselecteerde transactietype: alleen categorieën met type
 * 'inkomst' worden getoond voor inkomsten, en categorieën met type
 * 'uitgave' voor uitgaven.  Wanneer er geen categorieën beschikbaar zijn
 * wordt een lege lijst getoond.
 */

function normalizeCategoryType(t) {
  // Canonicaliseer categorie-/transactietype naar vaste waarden:
  // PASSIVA / KOSTEN / OPBRENGSTEN
  const s = (t || '').toString().trim().toLowerCase();
  if (!s) return '';

  // Legacy / Engelse varianten
  if (s === 'income' || s.startsWith('ink') || s.includes('omzet') || s.includes('verkoop')) return 'OPBRENGSTEN';
  if (s === 'expense' || s.startsWith('uitg') || s.startsWith('kost') || s.includes('kosten')) return 'KOSTEN';

  // Nederlandse vaste waarden
  if (s.startsWith('pass')) return 'PASSIVA';
  if (s.startsWith('kost')) return 'KOSTEN';
  if (s.startsWith('opbr')) return 'OPBRENGSTEN';

  // Als iemand al exact PASSIVA/KOSTEN/OPBRENGSTEN opgeslagen heeft (maar met andere casing)
  if (s === 'passiva') return 'PASSIVA';
  if (s === 'kosten') return 'KOSTEN';
  if (s === 'opbrengsten') return 'OPBRENGSTEN';

  // Fallback: geef de originele string terug (uppercased) zodat het niet stil kapot gaat.
  return s.toUpperCase();
}

function txTypeLabel(t) {
  const tt = normalizeCategoryType(t);
  if (tt === 'KOSTEN') return 'Kosten';
  if (tt === 'OPBRENGSTEN') return 'Opbrengsten';
  if (tt === 'PASSIVA') return 'Passiva';
  return 'Onbekend';
}



function getCategoriesFromSheet() {
  // Categorieën worden bewaard als HTML in localStorage (sheet view: 'categories').
  const key = (typeof LS !== 'undefined' && LS.sheetPrefix ? LS.sheetPrefix : 'boekhouden_sheet_') + 'categories';
  const html = localStorage.getItem(key);
  if (!html) return [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('#category-table') || doc.querySelector('table');
    if (!table) return [];
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const out = [];
    rows.forEach((tr) => {
      const tds = tr.querySelectorAll('td');
      if (!tds || tds.length < 2) return;

      const name = ((tds[0].textContent || '').trim());
      if (!name) return;

      const sel = tds[1].querySelector ? tds[1].querySelector('select') : null;
      const typeRaw = sel ? (sel.value || '') : (tds[1].textContent || '');
      out.push({ name, type: normalizeCategoryType((typeRaw || '').trim()) });
    });
    return out;
  } catch (e) {
    return [];
  }
}



let excelCategories = null;

/**
 * Load categories from the Excel file in /public/data/categorieen.xlsx.
 * Expected columns in the first sheet: Categorie, Type, Opmerkingen
 */
async function loadCategoriesFromExcel() {
  try {
    if (!window.XLSX) return null;
    const res = await fetch('data/categorieen.xlsx', { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames && wb.SheetNames[0];
    if (!sheetName) return null;
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const cats = [];
    rows.forEach((r) => {
      const name = String(r.Categorie || r.categorie || r.Naam || r.naam || '').trim();
      if (!name) return;
      const type = normalizeCategoryType(String(r.Type || r.type || '').trim());
      const notes = String(r.Opmerkingen || r.opmerkingen || r.Notes || r.notes || '').trim();
      cats.push({ name, type, notes });
    });
    return cats.length ? cats : null;
  } catch (e) {
    return null;
  }
}

/**
 * Ensure the Categories sheet (and booking dropdown) uses Excel as source of truth.
 * This overwrites the locally saved Categories sheet HTML so order matches Excel.
 */
async function ensureCategoriesFromExcel() {
  const cats = await loadCategoriesFromExcel();
  if (!cats) return;

  excelCategories = cats;

  // Update stored Categories sheet HTML so the UI reflects Excel order/content
  try {
    const tpl = document.getElementById('tpl-categories');
    if (!tpl) return;

    const doc = new DOMParser().parseFromString(`<div id="_wrap">${tpl.innerHTML}</div>`, 'text/html');
    const tbody = doc.querySelector('#_wrap #category-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    cats.forEach((c) => {
      const tr = doc.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.type)}</td><td>${escapeHtml(c.notes || '')}</td>`;
      tbody.appendChild(tr);
    });

    localStorage.setItem('boekhouden_sheet_categories', doc.querySelector('#_wrap').innerHTML);
  } catch (e) {
    // ignore
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function populateCategorySelect() {
  const categorySelect = document.getElementById('category');
  const typeSelect = document.getElementById('type');
  if (!categorySelect || !typeSelect) return;

  // Bepaal huidig type (PASSIVA / KOSTEN / OPBRENGSTEN)
  const currentType = normalizeCategoryType(typeSelect.value);

  // 1) Probeer categorieën te halen uit het bewerkbare Categorieën-blad (localStorage sheet HTML)
  // 2) Val terug op settings (voor compatibiliteit)
  let categories = getCategoriesFromSheet();
  if (!categories || !categories.length) {
    categories = (currentSettings && Array.isArray(currentSettings.categories))
      ? currentSettings.categories.map((c) => ({ name: c.name, type: normalizeCategoryType(c.type) }))
      : [];
  }

  // Filter categorieën op type
  const filtered = categories.filter((c) => c && normalizeCategoryType(c.type) === currentType);

  // Maak de select leeg
  categorySelect.innerHTML = '';

  // Voeg een lege optie toe zodat categorie optioneel is
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '- kies -';
  categorySelect.appendChild(emptyOpt);

  // Voeg opties toe voor elke categorie
  filtered.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name;
    categorySelect.appendChild(opt);
  });
}


// Utility to lighten a hex colour by mixing it with white.  Used for
// generating a "soft" variant of the theme colour for backgrounds.  The
// percent parameter indicates how much white to mix in (e.g. 0.85 adds 85%
// white).  Returns the resulting hex string.  If input is invalid the
// original value is returned.
function lightenColor(hex, percent = 0.85) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const mix = (c) => {
    const mixed = Math.round(c + (255 - c) * percent);
    return mixed.toString(16).padStart(2, '0');
  };
  return '#' + mix(r) + mix(g) + mix(b);
}

// Apply theming based on settings by updating CSS custom properties on the
// document root.  Expects an object with a `themeColor` property (hex
// including #).  When absent the defaults defined in CSS remain.
function applyTheme(settings) {
  if (!settings) return;
  const root = document.documentElement;
  const colour = settings.themeColor || '#2563eb';
  root.style.setProperty('--blue', colour);
  root.style.setProperty('--blue-soft', lightenColor(colour, 0.9));
  // custom CSS can be applied as an inline <style> if provided
  if (settings.customCss) {
    let styleTag = document.getElementById('custom-css');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'custom-css';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = settings.customCss;
  }
}

// Fetch persisted settings from the server and update the settings fields and
// general UI accordingly.  This is called on initial load and after saving
// settings.
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const settings = await res.json();
    currentSettings = settings;
    // Populate form fields when they exist on the page
    const yearEl = document.getElementById('settings-year');
    if (yearEl) yearEl.value = settings.year || new Date().getFullYear();
    const companyEl = document.getElementById('settings-company');
    if (companyEl) companyEl.value = settings.company || '';
    const vatEnabledEl = document.getElementById('settings-vatEnabled');
    if (vatEnabledEl) vatEnabledEl.value = String(!!settings.vatEnabled);
    const vatRateEl = document.getElementById('settings-vatRate');
    if (vatRateEl) {
      const perc = Number(settings.vatRate) * 100;
      // show as integer when possible, else with two decimals
      vatRateEl.value = !Number.isNaN(perc) ? parseFloat(perc.toFixed(2)) : '';
    }
    const themeEl = document.getElementById('settings-themeColor');
    if (themeEl) themeEl.value = settings.themeColor || '#2563eb';
    const notesEl = document.getElementById('settings-notes');
    if (notesEl) notesEl.value = settings.customCss || '';
    // Update header information
    const brandTitle = document.querySelector('.brand-title');
    const brandSubtitle = document.querySelector('.brand-subtitle');
    if (brandTitle) brandTitle.textContent = settings.company || brandTitle.textContent;
    // Gebruik een neutrale ondertitel zonder specifiek jaar zodat het duidelijk is
    // dat de boekhouding doorlopend is.  Het geselecteerde jaar wordt elders in
    // de interface weergegeven.
    if (brandSubtitle) brandSubtitle.textContent = 'Doorlopende boekhouding — Simpele webversie';
    applyTheme(settings);

    // Apply layout ordering
    applyLayoutFromSettings();

    // Werk de categorieënselect bij op basis van de geladen instellingen
    populateCategorySelect();
  } catch (e) {
    console.error('Fout bij laden settings:', e);
  }
}

async function fetchData() {
  const res = await fetch('/api/transactions');
  if (!res.ok) {
    throw new Error('Fout bij laden van data');
  }
  return res.json();
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount || 0);
}

function updateSummary(summary) {
  const incomeEl = document.getElementById('totalIncome');
  const expensesEl = document.getElementById('totalExpenses');
  const resultEl = document.getElementById('result');

  if (!incomeEl || !expensesEl || !resultEl) return;

  incomeEl.textContent = formatCurrency(summary.totalIncome);
  expensesEl.textContent = formatCurrency(summary.totalExpenses);
  resultEl.textContent = formatCurrency(summary.result);

  resultEl.classList.remove('positive', 'negative', 'neutral');
  if (summary.result > 0) resultEl.classList.add('positive');
  else if (summary.result < 0) resultEl.classList.add('negative');
  else resultEl.classList.add('neutral');
}

/**
 * Bepaal de unieke jaren in de lijst van transacties.  Een jaar wordt
 * afgeleid uit het datumveld (eerste vier karakters).  Transacties zonder
 * geldige datum worden genegeerd.  Retourneert een lijst in aflopende
 * volgorde (recentste jaar eerst).
 * @param {Array} list Transactielijst
 * @returns {string[]} Array met jaren
 */
function extractYears(list) {
  const years = new Set();
  for (const tx of list) {
    if (!tx || !tx.date) continue;
    const y = String(tx.date).substring(0, 4);
    if (/^\d{4}$/.test(y)) years.add(y);
  }
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

/**
 * Vul de keuzelijst voor het jaarfilter met beschikbare jaren en een
 * standaardoptie voor alle jaren.  Wanneer de huidige waarde niet meer
 * beschikbaar is (bijv. er zijn geen transacties meer voor dat jaar) wordt
 * automatisch 'all' geselecteerd.
 */
function populateYearFilter() {
  const select = document.getElementById('yearFilter');
  if (!select) return;
  const years = extractYears(lastData.transactions || []);
  // Leeg de lijst
  select.innerHTML = '';
  // Voeg standaard optie toe
  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = 'Alle jaren';
  select.appendChild(optAll);
  years.forEach((y) => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    select.appendChild(opt);
  });
  // Zorg dat de huidige selectie nog bestaat, anders reset naar 'all'
  if (!years.includes(currentYearFilter) && currentYearFilter !== 'all') {
    currentYearFilter = 'all';
  }
  select.value = currentYearFilter;
}

/**
 * Geef de transacties terug die horen bij het huidige jaarfilter.  Wanneer
 * currentYearFilter op 'all' staat worden alle transacties geleverd.  Anders
 * worden alleen transacties met een datum die begint met het gekozen jaar
 * geretourneerd.
 * @returns {Array} Gefilterde transacties
 */
function getFilteredTransactions() {
  if (currentYearFilter === 'all') return lastData.transactions || [];
  const prefix = String(currentYearFilter) + '-';
  return (lastData.transactions || []).filter((tx) => tx.date && tx.date.startsWith(prefix));
}

/**
 * Voer een lokale berekening van de samenvatting uit voor een lijst
 * transacties.  Dit dupliceert de logica van calculateSummary aan de
 * serverzijde, maar hier kunnen we een subset van transacties doorgeven
 * (bijv. per jaar).  Er wordt gebruik gemaakt van de huidige
 * instellingen om btw correct te verwerken.
 * @param {Array} list Gefilterde transactielijst
 * @param {Object} settings Settings met vatEnabled en vatRate
 * @returns {Object} Samenvatting met totalen en btw
 */
function calculateClientSummary(list, settings) {
  const cfg = settings || currentSettings || {};
  const vatEnabled = !!cfg.vatEnabled;
  const vatRate = vatEnabled ? Number(cfg.vatRate) || 0 : 0;
  let income = 0;
  let expenses = 0;
  let vatOnIncome = 0;
  let vatOnExpenses = 0;
  for (const tx of list || []) {
    const amount = Number(tx.amount) || 0;
    const tt = normalizeCategoryType(tx.type);
    if (tt === 'KOSTEN') {
      expenses += amount;
      if (vatRate > 0) {
        const vatPart = amount - amount / (1 + vatRate);
        vatOnExpenses += vatPart;
      }
    } else if (tt === 'OPBRENGSTEN') {
      income += amount;
      if (vatRate > 0) {
        const vatPart = amount - amount / (1 + vatRate);
        vatOnIncome += vatPart;
      }
    }
  }
  const result = income - expenses;
  const vatToPay = vatOnIncome - vatOnExpenses;
  return {
    totalIncome: income,
    totalExpenses: expenses,
    result,
    vatOnIncome,
    vatOnExpenses,
    vatToPay,
  };
}

/**
 * Bereken de samenvatting voor de huidige jaarfilter en werk de UI bij.
 * Update zowel de samenvatting in het dashboard als de W&V- en btw-tabellen.
 */
function updateSummaryDisplay() {
  const filtered = getFilteredTransactions();
  const summary = calculateClientSummary(filtered, currentSettings);
  lastFilteredSummary = summary;
  lastFilteredTransactions = filtered;
  updateSummary(summary);
  updateWvTable(summary);
  updateBtwTable(summary);
}

function setLayoutForView(view) {
  const summaryRow = document.querySelector('.summary-row');
  const grid = document.querySelector('.content-grid');
  const tableWrapper = document.querySelector('.table-wrapper');
  if (!summaryRow || !grid) return;

  const isTxView = view === 'dashboard';

  if (isTxView) {
    summaryRow.classList.remove('hidden');
    grid.classList.remove('single-panel');
    if (tableWrapper) tableWrapper.classList.remove('hidden');
  } else {
    summaryRow.classList.add('hidden');
    grid.classList.add('single-panel');
    if (tableWrapper) tableWrapper.classList.add('hidden');
  }
}

function renderTable(transactions) {
  const tbody = document.getElementById('txTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!transactions.length) {
    // Geen lege melding meer: laat de tabel gewoon leeg voor views zonder transacties.
    return;
  }

  let i = 0;
  for (const tx of transactions) {
    i += 1;
    const row = document.createElement('tr');
    row.classList.add('tx-row-click');
    row.addEventListener('click', () => openTxDrawer(tx));

    // Boeking (Jortt-achtig)
    bookingIndexById.set(tx.id, i);
    const bookingCell = document.createElement('td');
    bookingCell.textContent = `Boeking ${i} ${txTypeLabel(tx.type)}`;
    row.appendChild(bookingCell);

    // Specifieke kosten (categorie)
    const catCell = document.createElement('td');
    catCell.textContent = tx.category ? tx.category : '-';
    row.appendChild(catCell);

    // Datum
    const dateCell = document.createElement('td');
    dateCell.textContent = tx.date;
    row.appendChild(dateCell);

    // Omschrijving
    const descCell = document.createElement('td');
    descCell.textContent = tx.description;
    row.appendChild(descCell);

    // Btw-bedrag + Bedrag incl. btw
    const baseAmount = Number(tx.amount) || 0;
    const txVatRate = Number(tx.vatRate ?? tx.vat_rate ?? 0) || 0;
    const vatAmount = baseAmount * (txVatRate / 100);
    const amountIncl = baseAmount + vatAmount;

    const vatCell = document.createElement('td');
    vatCell.textContent = formatCurrency(vatAmount);
    vatCell.style.textAlign = 'right';
    row.appendChild(vatCell);

    const amountInclCell = document.createElement('td');
    amountInclCell.textContent = formatCurrency(amountIncl);
    amountInclCell.style.textAlign = 'right';
    row.appendChild(amountInclCell);

    tbody.appendChild(row);
  }
}

function openTxDrawer(tx, opts = {}) {
  drawerTx = tx;
  drawerEditMode = !!opts.startInEdit;

  const overlay = document.getElementById('txDrawer');
  if (!overlay) return;

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');

  const title = document.getElementById('txDrawerTitle');
  const subtitle = document.getElementById('txDrawerSubtitle');
  if (title) {
    const nr = bookingIndexById.get(tx.id);
    title.textContent = 'Boeking ' + (nr ? String(nr) : (tx.id ? String(tx.id).slice(-4) : ''));
  }
  if (subtitle) subtitle.textContent = txTypeLabel(tx.type) + ' • ' + (tx.description || '');

  renderTxDrawer();
}

function closeTxDrawer() {
  const overlay = document.getElementById('txDrawer');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  drawerTx = null;
  drawerEditMode = false;
}

function setDrawerMode(editMode) {
  drawerEditMode = !!editMode;
  renderTxDrawer();
}

function txTotals(tx) {
  const amountExcl = Number(tx.amount) || 0;
  const vatRate = Number(tx.vatRate) || 0;
  const vatAmount = amountExcl * (vatRate / 100);
  const amountIncl = amountExcl + vatAmount;
  return { amountExcl, vatRate, vatAmount, amountIncl };
}

function fillCategorySelect(selectEl, typeKey) {
  if (!selectEl) return;
  const key = normalizeCategoryType(typeKey);

  let categories = Array.isArray(excelCategories) && excelCategories.length ? excelCategories : getCategoriesFromSheet();
  if (!categories || !categories.length) {
    categories = (currentSettings && Array.isArray(currentSettings.categories))
      ? currentSettings.categories.map((c) => ({ name: c.name, type: normalizeCategoryType(c.type), notes: c.notes }))
      : [];
  }

  const filtered = (categories || []).filter((c) => c && normalizeCategoryType(c.type) === key);
  selectEl.innerHTML = '';
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '- kies -';
  selectEl.appendChild(emptyOpt);
  filtered.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name;
    selectEl.appendChild(opt);
  });
}


function extractPaymentMethodsFromAccountsHtml(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.getElementById('accounts-table');
    if (!table) return [];
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const names = rows
      .map((tr) => (tr.querySelector('td') ? tr.querySelector('td').textContent.trim() : ''))
      .filter((v) => v && v !== '-');
    // unieke waarden
    return Array.from(new Set(names));
  } catch {
    return [];
  }
}

function getPaymentMethods() {
  // Vanuit opgeslagen sheet (accounts) of de template-default
  const saved = localStorage.getItem('boekhouden_sheet_accounts');
  const html = saved || document.getElementById('tpl-accounts')?.innerHTML || '';
  return extractPaymentMethodsFromAccountsHtml(html);
}

function fillPaymentMethodSelect(selectEl) {
  if (!selectEl) return;
  const current = selectEl.value || '';
  selectEl.innerHTML = '<option value="">-- Kies betaalmethode --</option>';
  const methods = getPaymentMethods();
  for (const m of methods) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    selectEl.appendChild(opt);
  }
  // herstel huidige selectie indien mogelijk
  if (current) selectEl.value = current;
}


function renderTxDrawer() {
  if (!drawerTx) return;

  const viewEl = document.getElementById('txDrawerView');
  const formEl = document.getElementById('txDrawerForm');

  if (viewEl) viewEl.classList.toggle('hidden', drawerEditMode);
  if (formEl) formEl.classList.toggle('hidden', !drawerEditMode);

  const { amountExcl, vatRate, vatAmount, amountIncl } = txTotals(drawerTx);

  if (!drawerEditMode) {
    document.getElementById('txViewCategory')?.replaceChildren(document.createTextNode(drawerTx.category || '-'));
    document.getElementById('txViewPaymentMethod')?.replaceChildren(document.createTextNode(drawerTx.paymentMethod || '-'));
    document.getElementById('txViewDesc')?.replaceChildren(document.createTextNode(drawerTx.description || '-'));
    document.getElementById('txViewDate')?.replaceChildren(document.createTextNode(drawerTx.date || '-'));
    document.getElementById('txViewVat')?.replaceChildren(document.createTextNode(String(vatRate || 0) + '%'));
    document.getElementById('txViewExcl')?.replaceChildren(document.createTextNode(formatCurrency(amountExcl)));
    document.getElementById('txViewVatAmt')?.replaceChildren(document.createTextNode(formatCurrency(vatAmount)));
    document.getElementById('txViewIncl')?.replaceChildren(document.createTextNode(formatCurrency(amountIncl)));

    const att = document.getElementById('txViewAttachment');
    if (att) {
      att.innerHTML = '';
      if (drawerTx.attachmentData) {
        if (String(drawerTx.attachmentData).startsWith('data:image')) {
          const img = document.createElement('img');
          img.src = drawerTx.attachmentData;
          img.alt = drawerTx.attachmentName || 'Bon';
          img.style.cursor = 'pointer';
          img.title = 'Open bijlage';
          img.addEventListener('click', () => openAttachmentDataUrl(drawerTx.attachmentData, drawerTx.attachmentName));
          att.appendChild(img);
        } else {
          const a = document.createElement('a');
          a.href = '#';
          a.textContent = drawerTx.attachmentName || 'Bijlage openen';
          a.addEventListener('click', (e) => {
            e.preventDefault();
            openAttachmentModal(drawerTx);
          });
          att.appendChild(a);
        }
      } else {
        att.textContent = 'Geen bon';
        att.classList.add('muted');
      }
    }
    return;
  }

  document.getElementById('txDrawerId').value = drawerTx.id || '';
  document.getElementById('txDrawerDate').value = drawerTx.date || '';
  document.getElementById('txDrawerDesc').value = drawerTx.description || '';
  document.getElementById('txDrawerType').value = normalizeCategoryType(drawerTx.type) || 'KOSTEN';
  document.getElementById('txDrawerAmount').value = String(Number(drawerTx.amount) || 0);
  document.getElementById('txDrawerVat').value = String(Number(drawerTx.vatRate ?? 0) || 0);

  const catSelect = document.getElementById('txDrawerCategory');
  if (catSelect) {
    const typeKey = normalizeCategoryType(drawerTx.type);
    fillCategorySelect(catSelect, typeKey);
    catSelect.value = drawerTx.category || '';
  }

  const pmSelect = document.getElementById('txDrawerPaymentMethod');
  if (pmSelect) {
    fillPaymentMethodSelect(pmSelect);
    pmSelect.value = drawerTx.paymentMethod || '';
  }

  const attInfo = document.getElementById('txDrawerAttachmentInfo');
  if (attInfo) attInfo.textContent = drawerTx.attachmentName ? ('Gekoppeld: ' + drawerTx.attachmentName) : 'Geen bon';
}

function openEditModal(tx) {
  const overlay = document.getElementById('txModal');
  const msg = document.getElementById('txModalMsg');
  if (!overlay) return;

  editingTxId = tx.id;
  if (msg) {
    msg.textContent = '';
    msg.className = 'message';
  }

  const dateEl = document.getElementById('txEditDate');
  const descEl = document.getElementById('txEditDesc');
  const typeEl = document.getElementById('txEditType');
  const amountEl = document.getElementById('txEditAmount');
  const vatEl = document.getElementById('txEditVat');
  const catEl = document.getElementById('txEditCategory');

  if (dateEl) dateEl.value = tx.date || '';
  if (descEl) descEl.value = tx.description || '';
  if (typeEl) typeEl.value = normalizeCategoryType(tx.type) || 'KOSTEN';
  if (amountEl) amountEl.value = String(Number(tx.amount) || 0);
  if (vatEl) vatEl.value = String(Number(tx.vatRate ?? 0) || 0);
  if (catEl) catEl.value = tx.category || '';

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeEditModal() {
  const overlay = document.getElementById('txModal');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  editingTxId = null;
}

// Update the btw-aangifte table based on the computed summary.  The table is
// expected to have at least three rows: omzet hoog tarief, omzet laag tarief
// (unused for now) and voorbelasting.  The amounts are filled in with the
// amounts excluding VAT and the VAT amounts themselves.  When VAT is not
// enabled the values will be zero.
function updateBtwTable(summary) {
  if (!summary) return;

  const exclIncome = summary.totalIncome - summary.vatOnIncome;
  const exclExpenses = summary.totalExpenses - summary.vatOnExpenses;
  const vatIncome = summary.vatOnIncome;
  const vatExpenses = summary.vatOnExpenses;
  const netVat = vatIncome - vatExpenses;

  // Hoofdblok (rubrieken 1a, 5a, 5b, totaal)
  const elOmzetExcl = document.getElementById('btw-omzet-excl');
  const elOmzetVat = document.getElementById('btw-omzet-vat');
  const elCostsVat = document.getElementById('btw-costs-vat');
  const elNet = document.getElementById('btw-net');

  if (elOmzetExcl) elOmzetExcl.textContent = formatCurrency(exclIncome);
  if (elOmzetVat) elOmzetVat.textContent = formatCurrency(vatIncome);
  if (elCostsVat) elCostsVat.textContent = formatCurrency(vatExpenses);
  if (elNet) elNet.textContent = formatCurrency(netVat);

  // Blok 'Volgens de boekhouding' – eenvoudige weergave op basis van dezelfde
  // bedragen. In een echte boekhouding zouden dit de saldi van de rekeningen
  // 1500, 1520 en 1560 zijn.
  const elBooksPayable = document.getElementById('btw-books-payable');
  const elBooksInput = document.getElementById('btw-books-input');
  const elBooksNet = document.getElementById('btw-books-net');

  if (elBooksPayable) elBooksPayable.textContent = formatCurrency(vatIncome);
  if (elBooksInput) elBooksInput.textContent = formatCurrency(-vatExpenses);
  if (elBooksNet) elBooksNet.textContent = formatCurrency(netVat);
}


// Update the winst & verlies / balans table with totals from the summary.  The
// table is expected to have at least three rows: totale omzet, totaal
// uitgaven en resultaat.  Additional rows are ignored.
function updateWvTable(summary) {
  const table = document.getElementById('wv-table');
  if (!table || !summary) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  // Groepeer per categorie op basis van de gefilterde transacties.
  const map = new Map();
  for (const tx of lastFilteredTransactions || []) {
    const key = tx.category && tx.category.trim() ? tx.category.trim() : '-';
    if (!map.has(key)) {
      map.set(key, { opbrengsten: 0, kosten: 0 });
    }
    const bucket = map.get(key);
    const amount = Number(tx.amount) || 0;
    const tt = normalizeCategoryType(tx.type);
    if (tt === 'KOSTEN') {
      bucket.kosten += amount;
    } else if (tt === 'OPBRENGSTEN') {
      bucket.opbrengsten += amount;
    }
  }

  tbody.innerHTML = '';

  let totalIncome = 0;
  let totalExpenses = 0;

  for (const [name, bucket] of map.entries()) {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    const tdLoss = document.createElement('td');
    const tdProfit = document.createElement('td');

    tdName.textContent = name;
    tdLoss.textContent = bucket.kosten ? formatCurrency(bucket.kosten) : '';
    tdProfit.textContent = bucket.opbrengsten ? formatCurrency(bucket.opbrengsten) : '';

    totalIncome += bucket.opbrengsten;
    totalExpenses += bucket.kosten;

    tr.appendChild(tdName);
    tr.appendChild(tdLoss);
    tr.appendChild(tdProfit);
    tbody.appendChild(tr);
  }

  const result = totalIncome - totalExpenses;

  // Totaalregel
  const trTotal = document.createElement('tr');
  trTotal.classList.add('total-row');

  const tdLabel = document.createElement('td');
  tdLabel.textContent = 'Totaal';

  const tdTotalLoss = document.createElement('td');
  tdTotalLoss.textContent = totalExpenses ? formatCurrency(totalExpenses) : '';

  const tdTotalProfit = document.createElement('td');
  tdTotalProfit.textContent = totalIncome ? formatCurrency(totalIncome) : '';

  trTotal.appendChild(tdLabel);
  trTotal.appendChild(tdTotalLoss);
  trTotal.appendChild(tdTotalProfit);
  tbody.appendChild(trTotal);

  // Resultaatregel
  const trResult = document.createElement('tr');
  trResult.classList.add('subtotal-row');

  const tdResLabel = document.createElement('td');
  tdResLabel.textContent = 'Resultaat (winst / verlies)';

  const tdResLoss = document.createElement('td');
  const tdResProfit = document.createElement('td');

  if (result < 0) {
    tdResLoss.textContent = formatCurrency(Math.abs(result));
    tdResProfit.textContent = '';
  } else {
    tdResLoss.textContent = '';
    tdResProfit.textContent = formatCurrency(result);
  }

  trResult.appendChild(tdResLabel);
  trResult.appendChild(tdResLoss);
  trResult.appendChild(tdResProfit);
  tbody.appendChild(trResult);
}


// Apply the stored layout from settings by reordering navigation links and panels.
function applyLayoutFromSettings() {
  if (!currentSettings || !currentSettings.layout) return;
  const { navOrder, panelOrder } = currentSettings.layout;
  // Reorder navigation links
  if (Array.isArray(navOrder)) {
    const navContainer = document.querySelector('.top-nav');
    if (navContainer) {
      const links = Array.from(navContainer.children);
      navOrder.forEach((view) => {
        const el = links.find((l) => l.dataset && l.dataset.view === view);
        if (el) {
          navContainer.appendChild(el);
        }
      });
    }
  }
  // Reorder panels inside the content grid
  if (Array.isArray(panelOrder)) {
    const grid = document.querySelector('.content-grid');
    if (grid) {
      const panels = Array.from(grid.children);
      panelOrder.forEach((id) => {
        const panel = panels.find((p) => p.getAttribute('data-panel-id') === id);
        if (panel) {
          grid.appendChild(panel);
        }
      });
    }
  }
}

// Enable layout edit mode: make nav links and panels draggable and show save button
function enableLayoutEditMode() {
  if (isLayoutEditMode) return;
  isLayoutEditMode = true;
  document.body.classList.add('layout-edit-mode');
  // Show layout save button
  const editActions = document.querySelector('.layout-edit-actions');
  if (editActions) editActions.classList.remove('hidden');
  // Make nav links draggable
  const navLinks = document.querySelectorAll('.top-nav .nav-link');
  navLinks.forEach((el) => {
    el.setAttribute('draggable', 'true');
  });
  const navContainer = document.querySelector('.top-nav');
  if (navContainer) {
    navContainer.addEventListener('dragstart', navDragStart);
    navContainer.addEventListener('dragover', navDragOver);
    navContainer.addEventListener('drop', navDrop);
  }
  // Make panels draggable
  const panels = document.querySelectorAll('.content-grid > .panel');
  panels.forEach((p) => {
    p.setAttribute('draggable', 'true');
  });
  const grid = document.querySelector('.content-grid');
  if (grid) {
    grid.addEventListener('dragstart', panelDragStart);
    grid.addEventListener('dragover', panelDragOver);
    grid.addEventListener('drop', panelDrop);
  }
}

// Disable layout edit mode: remove draggable behaviour and hide save button
function disableLayoutEditMode() {
  if (!isLayoutEditMode) return;
  isLayoutEditMode = false;
  document.body.classList.remove('layout-edit-mode');
  // Hide layout save button
  const editActions = document.querySelector('.layout-edit-actions');
  if (editActions) editActions.classList.add('hidden');
  // Remove draggable attributes and listeners
  const navLinks = document.querySelectorAll('.top-nav .nav-link');
  navLinks.forEach((el) => {
    el.removeAttribute('draggable');
  });
  const navContainer = document.querySelector('.top-nav');
  if (navContainer) {
    navContainer.removeEventListener('dragstart', navDragStart);
    navContainer.removeEventListener('dragover', navDragOver);
    navContainer.removeEventListener('drop', navDrop);
  }
  const panels = document.querySelectorAll('.content-grid > .panel');
  panels.forEach((p) => {
    p.removeAttribute('draggable');
  });
  const grid = document.querySelector('.content-grid');
  if (grid) {
    grid.removeEventListener('dragstart', panelDragStart);
    grid.removeEventListener('dragover', panelDragOver);
    grid.removeEventListener('drop', panelDrop);
  }
  draggedNavItem = null;
  draggedPanelItem = null;
}

// Toggle layout edit mode when the user clicks the button
function toggleLayoutEditMode() {
  if (isLayoutEditMode) {
    disableLayoutEditMode();
  } else {
    enableLayoutEditMode();
  }
}

// Save the current layout order to the backend settings
async function saveLayoutChanges() {
  try {
    const navOrder = Array.from(document.querySelectorAll('.top-nav .nav-link')).map((el) => el.dataset.view);
    const panelOrder = Array.from(document.querySelectorAll('.content-grid > .panel')).map((el) => el.getAttribute('data-panel-id'));
    const payload = { layout: { navOrder, panelOrder } };
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const msgEl = document.getElementById('layoutSaveMessage');
    if (!res.ok) {
      if (msgEl) {
        msgEl.textContent = 'Fout bij opslaan van lay-out';
        msgEl.className = 'message error';
      }
      return;
    }
    const data = await res.json();
    // Update current settings with new layout
    if (data && data.settings && data.settings.layout) {
      if (!currentSettings) currentSettings = {};
      currentSettings.layout = data.settings.layout;
    }
    if (msgEl) {
      msgEl.textContent = 'Lay-out opgeslagen';
      msgEl.className = 'message ok';
    }
    // Exit edit mode after saving
    disableLayoutEditMode();
  } catch (e) {
    console.error('Fout bij opslaan van layout:', e);
    const msgEl = document.getElementById('layoutSaveMessage');
    if (msgEl) {
      msgEl.textContent = 'Fout bij opslaan van lay-out';
      msgEl.className = 'message error';
    }
  }
}

// Drag and drop handlers for nav reordering
function navDragStart(e) {
  const target = e.target.closest('.nav-link');
  if (!target) return;
  draggedNavItem = target;
  e.dataTransfer.effectAllowed = 'move';
}
function navDragOver(e) {
  e.preventDefault();
}
function navDrop(e) {
  e.preventDefault();
  const target = e.target.closest('.nav-link');
  if (!target || !draggedNavItem || target === draggedNavItem) return;
  const navContainer = target.parentElement;
  const items = Array.from(navContainer.children);
  const dragIndex = items.indexOf(draggedNavItem);
  const targetIndex = items.indexOf(target);
  if (dragIndex < targetIndex) {
    navContainer.insertBefore(draggedNavItem, target.nextSibling);
  } else {
    navContainer.insertBefore(draggedNavItem, target);
  }
}

// Drag and drop handlers for panel reordering
function panelDragStart(e) {
  const target = e.target.closest('.panel');
  if (!target) return;
  draggedPanelItem = target;
  e.dataTransfer.effectAllowed = 'move';
}
function panelDragOver(e) {
  e.preventDefault();
}
function panelDrop(e) {
  e.preventDefault();
  const target = e.target.closest('.panel');
  if (!target || !draggedPanelItem || target === draggedPanelItem) return;
  const grid = target.parentElement;
  const items = Array.from(grid.children);
  const dragIndex = items.indexOf(draggedPanelItem);
  const targetIndex = items.indexOf(target);
  if (dragIndex < targetIndex) {
    grid.insertBefore(draggedPanelItem, target.nextSibling);
  } else {
    grid.insertBefore(draggedPanelItem, target);
  }
}

function makeSheetEditable(root) {
  if (!root) return;
  root.querySelectorAll('td').forEach((td) => {
    td.setAttribute('contenteditable', 'true');
  });
  // Special-case: categories sheet gets a dropdown in the "Type" column.
  enhanceCategoryTypeDropdown(root);
  enhanceCategoryRowControls(root);
  enhanceCategoryBulkType(root);
  enhanceSheetUi(root);
}

// Maak (delen van) een sheet read-only. Dit wordt gebruikt voor het
// categorieën-tabblad, omdat categorieën uit Excel worden ingelezen.
function makeSheetReadOnly(root) {
  if (!root) return;
  root.querySelectorAll('td[contenteditable]').forEach((td) => {
    td.removeAttribute('contenteditable');
  });
  // Als er toch inputs/selects in de categorieën-tabel staan (legacy opgeslagen sheet),
  // schakel ze uit zodat je niets per ongeluk in de UI aanpast.
  const catTable = root.querySelector('#category-table');
  if (catTable) {
    catTable.querySelectorAll('input, select, textarea').forEach((el) => {
      el.disabled = true;
    });
  }
}


function enhanceSheetUi(root) {
  if (!root) return;

  // Buttons like "+ Categorie toevoegen"
  root.querySelectorAll('[data-action="add-row"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      let table = null;

      if (targetId) {
        table = root.querySelector('#' + CSS.escape(targetId));
      }

      // Fallback: nearest section table
      if (!table) {
        const section = btn.closest('section') || btn.closest('.sheet-section') || btn.closest('.sheet-card');
        if (section) table = section.querySelector('table');
      }

      if (table) addRowToTable(table);
    });
  });
}

function enhanceCategoryTypeDropdown(root) {
  const table = root.querySelector('#category-table');
  if (!table) return;

  const ensureCell = (td) => {
    if (!td) return;
    td.removeAttribute('contenteditable');
    // If select already exists, do nothing.
    if (td.querySelector('select')) return;
    const current = normalizeCategoryType((td.textContent || '').trim()) || 'KOSTEN';
    td.textContent = '';
    const sel = document.createElement('select');
    sel.className = 'cell-select';
    const opt1 = document.createElement('option');
    opt1.value = 'PASSIVA'; opt1.textContent = 'PASSIVA';
    const opt2 = document.createElement('option');
    opt2.value = 'KOSTEN'; opt2.textContent = 'KOSTEN';
    const opt3 = document.createElement('option');
    opt3.value = 'OPBRENGSTEN'; opt3.textContent = 'OPBRENGSTEN';
    sel.appendChild(opt1); sel.appendChild(opt2); sel.appendChild(opt3);
    sel.value = current;
    td.appendChild(sel);
  };

  // existing rows
  Array.from(table.querySelectorAll('tbody tr')).forEach((tr) => {
    const tds = tr.querySelectorAll('td');
    if (tds && tds.length >= 2) ensureCell(tds[1]);
  });
}


  


function enhanceCategoryRowControls(root) {
  const table = root.querySelector('#category-table');
  if (!table) return;

  return; // bulk/actions disabled: categories come from Excel
// Ensure header has an "Acties" column
  const headRow = table.querySelector('thead tr');
  if (headRow && headRow.children.length < 4) {
    const th = document.createElement('th');
    th.textContent = 'Acties';
    headRow.appendChild(th);
  }
  // Ensure "select all" checkbox exists in header actions cell
  if (headRow && headRow.children.length >= 4) {
    const actiesTh = headRow.children[3];
    if (actiesTh && !actiesTh.querySelector('.select-all')) {
      actiesTh.innerHTML = '';
      const label = document.createElement('label');
      label.className = 'select-all';
      label.innerHTML = `<input type="checkbox" id="category-select-all"> <span>Alles</span>`;
      actiesTh.appendChild(label);
    }
  }


  const ensureButtons = (tr) => {
    const tds = Array.from(tr.children);
    // Ensure we have 4 columns
    while (tr.children.length < 4) {
      tr.appendChild(document.createElement('td'));
    }
    const actionTd = tr.children[3];
    actionTd.removeAttribute('contenteditable');
    actionTd.classList.add('row-actions');
    if (actionTd.querySelector('button')) return;

    actionTd.innerHTML = `
      <label class="row-select-wrap"><input type="checkbox" class="row-select" aria-label="Selecteer categorie"></label>
      <button type="button" class="icon-btn" data-action="move-up" title="Omhoog">↑</button>
      <button type="button" class="icon-btn" data-action="move-down" title="Omlaag">↓</button>
      <button type="button" class="icon-btn danger" data-action="delete-row" title="Verwijderen">✕</button>
    `;
  };

  const tbody = table.querySelector('tbody');
  if (tbody) {
    Array.from(tbody.querySelectorAll('tr')).forEach(ensureButtons);
  }

  // Event delegation for action buttons
  table.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const tr = btn.closest('tr');
    const tbody2 = tr ? tr.parentElement : null;
    if (!tr || !tbody2) return;

    if (action === 'move-up') {
      const prev = tr.previousElementSibling;
      if (prev) tbody2.insertBefore(tr, prev);
      e.preventDefault();
    } else if (action === 'move-down') {
      const next = tr.nextElementSibling;
      if (next) tbody2.insertBefore(next, tr);
      e.preventDefault();
    } else if (action === 'delete-row') {
      tr.remove();
      e.preventDefault();
    }
  }, { passive: false });
}


function enhanceCategoryBulkType(root) {
  const table = root.querySelector('#category-table');
  if (!table) return;

  return; // bulk/actions disabled: categories come from Excel
// Avoid double init
  if (root.querySelector('.bulk-type-bar')) return;

  const bar = document.createElement('div');
  bar.className = 'bulk-type-bar';
  bar.innerHTML = `
    <div class="bulk-left">
      <span class="bulk-hint">Selecteer meerdere categorieën en pas in 1 keer het type aan.</span>
    </div>
    <div class="bulk-right">
      <label class="bulk-label" for="bulk-category-type">Type</label>
      <select id="bulk-category-type" class="bulk-select">
        <option value="PASSIVA">PASSIVA</option>
        <option value="KOSTEN">KOSTEN</option>
        <option value="OPBRENGSTEN">OPBRENGSTEN</option>
      </select>
      <button type="button" class="btn-secondary" id="apply-bulk-type">Type toepassen</button>
    </div>
  `;

  table.parentElement.insertBefore(bar, table);

  const msgEl = document.getElementById('sheetMessage');
  const selectAll = root.querySelector('#category-select-all');

  const updateSelectAllState = () => {
    if (!selectAll) return;
    const boxes = Array.from(table.querySelectorAll('input.row-select'));
    const checked = boxes.filter(b => b.checked);

    if (boxes.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      return;
    }

    selectAll.checked = checked.length === boxes.length;
    selectAll.indeterminate = checked.length > 0 && checked.length < boxes.length;
  };

  if (selectAll) {
    selectAll.addEventListener('change', () => {
      const checked = !!selectAll.checked;
      table.querySelectorAll('input.row-select').forEach((cb) => { cb.checked = checked; });
      updateSelectAllState();
    });
  }

  table.addEventListener('change', (e) => {
    const cb = e.target && e.target.classList && e.target.classList.contains('row-select') ? e.target : null;
    if (cb) updateSelectAllState();
  });

  const btn = bar.querySelector('#apply-bulk-type');
  const bulkSelect = bar.querySelector('#bulk-category-type');

  if (btn && bulkSelect) {
    btn.addEventListener('click', () => {
      const newType = bulkSelect.value;
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      let changed = 0;

      rows.forEach((tr) => {
        const cb = tr.querySelector('input.row-select');
        if (!cb || !cb.checked) return;

        const sel = tr.querySelector('select.cell-select');
        if (sel) {
          sel.value = newType;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          changed++;
          return;
        }

        const tds = tr.querySelectorAll('td');
        if (tds && tds.length >= 2) {
          tds[1].textContent = newType;
          changed++;
        }
      });

      updateSelectAllState();

      if (msgEl) {
        if (changed === 0) {
          msgEl.textContent = 'Selecteer eerst één of meerdere categorieën.';
          msgEl.className = 'sheet-message warning';
        } else {
          msgEl.textContent = 'Type aangepast voor ' + changed + ' categorie' + (changed === 1 ? '' : 'ën') + '.';
          msgEl.className = 'sheet-message success';
        }
      }
    });
  }

  updateSelectAllState();
}

function addRowToTable(table) {
  if (!table) return;
  const headRow = table.querySelector('thead tr');
  const colCount = headRow ? headRow.children.length : 1;
  const tbody = table.querySelector('tbody') || table.createTBody();
  const tr = document.createElement('tr');

  for (let i = 0; i < colCount; i++) {
    const td = document.createElement('td');

    // Category actions column
    if (table.id === 'category-table' && i === 3) {
      td.classList.add('row-actions');
      td.removeAttribute('contenteditable');
      td.innerHTML = `
        <label class="row-select-wrap"><input type="checkbox" class="row-select" aria-label="Selecteer categorie"></label>
        <button type="button" class="icon-btn" data-action="move-up" title="Omhoog">↑</button>
        <button type="button" class="icon-btn" data-action="move-down" title="Omlaag">↓</button>
        <button type="button" class="icon-btn danger" data-action="delete-row" title="Verwijderen">✕</button>
      `;
      tr.appendChild(td);
      continue;
    }
    // Category type column uses a dropdown.
    if (table.id === 'category-table' && i === 1) {
      td.removeAttribute('contenteditable');
      const sel = document.createElement('select');
      sel.className = 'cell-select';

      const opt1 = document.createElement('option');
      opt1.value = 'PASSIVA'; opt1.textContent = 'PASSIVA';
      const opt2 = document.createElement('option');
      opt2.value = 'KOSTEN'; opt2.textContent = 'KOSTEN';
      const opt3 = document.createElement('option');
      opt3.value = 'OPBRENGSTEN'; opt3.textContent = 'OPBRENGSTEN';

      sel.appendChild(opt1);
      sel.appendChild(opt2);
      sel.appendChild(opt3);

      sel.value = 'KOSTEN';
      td.appendChild(sel);
    } else {
      td.setAttribute('contenteditable', 'true');
    }

    tr.appendChild(td);
  }

  tbody.appendChild(tr);

  // Als we een rij toevoegen in de categorieën-tabel, zorg dan meteen dat
  // bestaande type-cellen een dropdown zijn.
  if (table.id === 'category-table') {
    enhanceCategoryTypeDropdown(document);
  }
}


async function loadSheetFromServer(view) {
  if (sheetCache[view]) return sheetCache[view];

  try {
    const res = await fetch('/api/sheets/' + encodeURIComponent(view));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data && data.html) {
      sheetCache[view] = data.html;
      return data.html;
    }
  } catch (e) {
    console.error('Kon sheet niet laden:', e);
  }

  sheetCache[view] = null;
  return null;
}

function setSheetContent(view) {
  const container = document.getElementById('sheetContent');
  if (!container) return;

  const toolbarMsg = document.getElementById('sheetMessage');
  if (toolbarMsg) {
    toolbarMsg.textContent = '';
    toolbarMsg.className = 'sheet-message';
  }

  container.innerHTML = '';

  const cached = sheetCache[view];
  if (typeof cached === 'string') {
    container.innerHTML = cached;
    if (view === 'categories') {
      makeSheetReadOnly(container);
    } else {
      makeSheetEditable(container);
    }
    return;
  }

  const tpl = document.getElementById('tpl-' + view);
  if (tpl && tpl.content) {
    const fragment = tpl.content.cloneNode(true);
    container.appendChild(fragment);
    // Categorieën: toon (read-only) de lijst uit Excel. Als die nog niet geladen is,
    // blijft de tabel leeg tot de sheet vanuit localStorage wordt geladen.
    if (view === 'categories') {
      const table = container.querySelector('#category-table');
      const tbody = table ? table.querySelector('tbody') : null;
      const cats = Array.isArray(excelCategories) ? excelCategories : null;
      if (tbody && cats && cats.length) {
        tbody.innerHTML = '';
        cats.forEach((c) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.type)}</td><td>${escapeHtml(c.notes || '')}</td>`;
          tbody.appendChild(tr);
        });
      }
      makeSheetReadOnly(container);
    } else {
      makeSheetEditable(container);
    }
  } else {
    const p = document.createElement('p');
    p.textContent = 'Geen inhoud beschikbaar voor dit tabblad.';
    container.appendChild(p);
  }

  // als er nog geen cache is, probeer dan later nog één keer vanaf de server
  if (typeof cached === 'undefined') {
    loadSheetFromServer(view).then((html) => {
      if (html) {
        container.innerHTML = html;
        if (view === 'categories') {
          makeSheetReadOnly(container);
        } else {
          makeSheetEditable(container);
        }
      }
    });
  }
}

async function saveCurrentSheet() {
  const container = document.getElementById('sheetContent');
  const btn = document.getElementById('saveSheetBtn');
  const msg = document.getElementById('sheetMessage');
  if (!container || !btn || !msg) return;

  try {
    btn.disabled = true;
    msg.textContent = 'Opslaan...';
    msg.className = 'sheet-message';

    const html = container.innerHTML;

    // Always persist the sheet HTML when editing; for the settings view we also
    // persist the settings object.  The server expects the HTML field even
    // though it may be empty for some views.
    const res = await fetch('/api/sheets/' + encodeURIComponent(currentView), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });

    if (!res.ok) {
      throw new Error('Status ' + res.status);
    }

    sheetCache[currentView] = html;

    // If we are on the settings tab then collect the settings values and send
    // them to the backend.  We do this after saving the sheet so that both
    // operations complete in sequence.  The fields are optional; missing
    // values will not override existing settings on the server.
    if (currentView === 'settings') {
      const yearEl = document.getElementById('settings-year');
      const companyEl = document.getElementById('settings-company');
      const vatEnabledEl = document.getElementById('settings-vatEnabled');
      const vatRateEl = document.getElementById('settings-vatRate');
      const themeEl = document.getElementById('settings-themeColor');
      const notesEl = document.getElementById('settings-notes');
      const settingsPayload = {
        year: yearEl ? Number(yearEl.value) : undefined,
        company: companyEl ? companyEl.value : undefined,
        vatEnabled: vatEnabledEl ? vatEnabledEl.value === 'true' : undefined,
        vatRate: vatRateEl ? Number(vatRateEl.value) / 100 : undefined,
        themeColor: themeEl ? themeEl.value : undefined,
        customCss: notesEl ? notesEl.value : undefined,
      };
      try {
        const resSettings = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settingsPayload),
        });
        if (!resSettings.ok) {
          throw new Error('Status ' + resSettings.status);
        }
        // Refresh settings and theme after successful save
        await loadSettings();
      } catch (e) {
        console.error('Fout bij opslaan van instellingen:', e);
      }
    } else if (currentView === 'categories') {
      // Wanneer we in het categorieën-tabblad zitten, verzamel dan de
      // categorieën uit de tabel en sla deze op in de instellingen.
      const table = container.querySelector('#category-table');
      const newCategories = [];
      if (table) {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const name = cells[0].textContent.trim();
            const type = normalizeCategoryType(cells[1].textContent.trim());
            const notes = cells[2] ? cells[2].textContent.trim() : '';
            if (name) {
              newCategories.push({ name, type, notes });
            }
          }
        });
      }
      try {
        const resSettings = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categories: newCategories }),
        });
        if (!resSettings.ok) {
          throw new Error('Status ' + resSettings.status);
        }
        // Na het opslaan van categorieën, ververs de instellingen zodat
        // categorieën op andere plekken (bijv. formulier) worden bijgewerkt
        await loadSettings();
        // Werk de categorie-select meteen bij
        populateCategorySelect();
      } catch (e) {
        console.error('Fout bij opslaan van categorieën:', e);
      }
    }

    msg.textContent = 'Opgeslagen';
    msg.className = 'sheet-message ok';
  } catch (e) {
    console.error('Fout bij opslaan van sheet:', e);
    msg.textContent = 'Fout bij opslaan';
    msg.className = 'sheet-message error';
  } finally {
    btn.disabled = false;
  }
}

function applyView() {
  const titleEls = document.querySelectorAll('.panel-header h2');
  const captionEls = document.querySelectorAll('.panel-caption');

  // Captions are shown by default; specific views can hide them.
  captionEls.forEach((el) => el.classList.remove('hidden'));

  const rightTitle = titleEls[1] || titleEls[0];
  const rightCaption = captionEls[1] || captionEls[0];

  // Begin met transacties die horen bij het huidige jaarfilter.  Hierdoor
  // tonen we alleen transacties voor het geselecteerde jaar in de tabel en
  // hoeft de gebruiker niet steeds tussen verschillende boekjaren te
  // wisselen.  Voor 'all' worden alle transacties getoond.
  let txs = getFilteredTransactions();

  setLayoutForView(currentView);

  const yearText = currentYearFilter === 'all' ? 'alle jaren' : currentYearFilter;
  switch (currentView) {
    case 'dashboard':
      rightTitle.textContent = 'Transacties ' + yearText;
      rightCaption.textContent = 'Overzicht van alle mutaties (' + yearText + ').';
      break;
    case 'factuur':
      rightTitle.textContent = 'Factuur';
      rightCaption.textContent =
        'Factuurfunctionaliteit is nog niet geïmplementeerd in deze simpele versie.';
      txs = [];
      break;
    case 'categories':
      rightTitle.textContent = 'Categorieën';
      // Minimal view: only the title + table.
      rightCaption.textContent = '';
      rightCaption.classList.add('hidden');
      txs = [];
      break;
    case 'accounts':
      rightTitle.textContent = 'Betaalmethoden';
      rightCaption.textContent =
        'Beheer hier je betaalmethoden zoals in het Excel-tabblad.';
      txs = [];
      break;
    case 'beginbalans':
      rightTitle.textContent = 'Beginbalans';
      rightCaption.textContent =
        'Vul hier je beginbalans in zoals in het Excel-tabblad.';
      txs = [];
      break;
    case 'relations':
      rightTitle.textContent = 'Relaties';
      rightCaption.textContent =
        'Beheer hier je relaties zoals in het Excel-tabblad.';
      txs = [];
      break;
    case 'wvbalans':
      rightTitle.textContent = 'Winst & Verlies / Balans';
      rightCaption.textContent = 'Overzicht van W&V en balans (' + yearText + ').';
      txs = [];
      // Vul de W&V/balans tabel met de gefilterde samenvatting
      updateWvTable(lastFilteredSummary || lastData.summary);
      break;
    case 'btw':
      rightTitle.textContent = 'Btw-aangifte';
      rightCaption.textContent = 'Overzicht btw (' + yearText + ').';
      txs = [];
      // Update the VAT overview table using the gefilterde samenvatting
      updateBtwTable(lastFilteredSummary || lastData.summary);
      break;
    case 'settings':
      rightTitle.textContent = 'Instellingen';
      rightCaption.textContent =
        'Algemene instellingen voor je administratie.';
      txs = [];
      break;
    case 'disclaimer':
      rightTitle.textContent = 'Disclaimer';
      rightCaption.textContent =
        'Dit is een hulpmiddel en geen officiële boekhoudsoftware.';
      txs = [];
      break;
    default:
      rightTitle.textContent = 'Transacties ' + yearText;
      rightCaption.textContent = 'Overzicht van alle mutaties (' + yearText + ').';
      break;
  }

  renderTable(txs);

  const sheet = document.getElementById('sheetContent');
  const toolbar = document.getElementById('sheetToolbar');
  const sheetViews = [
    'categories',
    'accounts',
    'beginbalans',
    'relations',
    'wvbalans',
    'btw',
    'settings',
    'disclaimer',
  ];

  if (sheetViews.includes(currentView)) {
    if (sheet) sheet.style.display = '';
    // Categorieën komen uit Excel en zijn read-only; daar hoort geen "Wijzigingen opslaan" bij.
    if (toolbar) toolbar.style.display = (currentView === 'categories' ? 'none' : '');
    setSheetContent(currentView);
  } else {
    if (sheet) {
      sheet.style.display = 'none';
      sheet.innerHTML = '';
    }
    if (toolbar) toolbar.style.display = 'none';
  }
}

function setActiveNav(view) {
  currentView = view;
  document.querySelectorAll('.top-nav .nav-link').forEach((btn) => {
    if (btn.dataset.view === view) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  applyView();
}

async function reload() {
  try {
    const data = await fetchData();
    lastData = {
      transactions: data.transactions || [],
      summary:
        data.summary || { totalIncome: 0, totalExpenses: 0, result: 0 },
    };
    // Update the year filter based on the loaded transactions.  This will
    // repopulate the dropdown and ensure the currently selected year is
    // preserved if possible.
    populateYearFilter();
    // Update the view (table and captions) based on the filtered transactions.
    applyView();
    // Compute and display the summary for the current year filter.  This
    // updates the summary cards, W&V table and BTW table.
    updateSummaryDisplay();
    populateCategorySelect();
  } catch (err) {
    console.error(err);
    const msg = document.getElementById('formMessage');
    if (msg) {
      msg.textContent = 'Fout bij laden van data';
      msg.className = 'message error';
    }
  }
}

async function onSubmit(event) {
  event.preventDefault();
  const date = document.getElementById('date').value;
  const description = document.getElementById('description').value;
  const amount = document.getElementById('amount').value;
  const vatRateEl = document.getElementById('vatRate');
  const vatRate = vatRateEl ? vatRateEl.value : '0';
  const type = document.getElementById('type').value;
  const category = document.getElementById('category') ? document.getElementById('category').value : '';

  const msg = document.getElementById('formMessage');
  if (msg) {
    msg.textContent = '';
    msg.className = 'message';
  }

  try {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, description, amount, vatRate, type, category }),
    });

    if (!res.ok) {
      throw new Error('Fout bij opslaan');
    }

    await reload();

    if (msg) {
      msg.textContent = 'Transactie opgeslagen';
      msg.className = 'message ok';
    }

    document.getElementById('description').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('date').valueAsDate = new Date();
  } catch (err) {
    console.error(err);
    if (msg) {
      msg.textContent = 'Fout bij opslaan van transactie';
      msg.className = 'message error';
    }
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // Lees categorieën uit het Excel-bestand (bron van waarheid).
  // We wachten hierop zodat de categorie-dropdown in "Nieuwe transactie" meteen gevuld kan worden.
  await ensureCategoriesFromExcel();
  // Houd de sheetCache in sync, zodat het categorieën-tabblad direct de Excel-versie toont.
  const excelSheetHtml = localStorage.getItem('boekhouden_sheet_categories');
  if (excelSheetHtml) sheetCache.categories = excelSheetHtml;
  populateCategorySelect();

  const todayInput = document.getElementById('date');
  if (todayInput) {
    todayInput.valueAsDate = new Date();
  }

  const form = document.getElementById('txForm');
  if (form) {
    form.addEventListener('submit', onSubmit);
  }

  // Wanneer het type (inkomst/uitgave) wordt gewijzigd, past de
  // categorie-selectie zich automatisch aan zodat alleen de relevante
  // categorieën (inkomst of uitgave) worden getoond.
  const typeSelect = document.getElementById('type');
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      populateCategorySelect();
    });
  }

  const saveSheetBtn = document.getElementById('saveSheetBtn');
  if (saveSheetBtn) {
    saveSheetBtn.addEventListener('click', () => {
      saveCurrentSheet();
    });
  }

  // Categorieën: herlaad Excel zonder de hele pagina te refreshen.
  document.addEventListener('click', async (event) => {
    const btn = event.target && event.target.closest ? event.target.closest('#reloadCategoriesExcelBtn') : null;
    if (!btn) return;
    event.preventDefault();

    const setStatus = (text, cls) => {
      const el = document.getElementById('categoriesExcelStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'sheet-message' + (cls ? ' ' + cls : '');
    };

    try {
      btn.disabled = true;
      setStatus('Excel wordt opnieuw ingeladen…');
      await ensureCategoriesFromExcel();
      const html = localStorage.getItem('boekhouden_sheet_categories');
      if (html) sheetCache.categories = html;
      // Refresh de categorieën-sheet als je daar nu bent
      if (currentView === 'categories') {
        setSheetContent('categories');
      }
      // Update de dropdown in het boekingsformulier
      populateCategorySelect();
      setStatus('Excel opnieuw ingeladen', 'ok');
    } catch (e) {
      console.error(e);
      setStatus('Fout bij opnieuw inladen', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.querySelectorAll('.top-nav .nav-link').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      const view = btn.dataset.view || 'dashboard';
      setActiveNav(view);
    });
  });

  // Extra navigatieknoppen binnen de pagina (bijv. op het dashboard)
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-goto-view]');
    if (target) {
      event.preventDefault();
      const view = target.getAttribute('data-goto-view');
      if (view) {
        setActiveNav(view);
      }
    }
  });

  // Load settings first (applies theme and header) then load transactions
  loadSettings().then(() => {
    reload();
  });

  // Koppel de jaarfilter aan een change-handler zodat bij wijzigen van het
  // geselecteerde jaar de transacties, samenvatting en tabellen opnieuw
  // worden berekend.  De handler past de huidige jaarfilter aan en roept
  // updateSummaryDisplay en applyView aan.
  const yearSelect = document.getElementById('yearFilter');
  if (yearSelect) {
    yearSelect.addEventListener('change', (ev) => {
      currentYearFilter = ev.target.value || 'all';
      updateSummaryDisplay();
      applyView();
    });
  }

  // Attach layout editing buttons if they exist
  const toggleLayoutBtn = document.getElementById('toggleLayoutEditBtn');
  if (toggleLayoutBtn) {
    toggleLayoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleLayoutEditMode();
    });
  }
  const saveLayoutBtn = document.getElementById('saveLayoutConfigBtn');
  if (saveLayoutBtn) {
    saveLayoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      saveLayoutChanges();
    });
  }

  // --- Edit modal wiring ---
  const modalOverlay = document.getElementById('txModal');
  const modalClose = document.getElementById('txModalClose');
  const modalCancel = document.getElementById('txModalCancel');
  const modalForm = document.getElementById('txModalForm');
  if (modalClose) modalClose.addEventListener('click', closeEditModal);
  if (modalCancel) modalCancel.addEventListener('click', closeEditModal);
  if (modalOverlay) {
    // Click outside the modal closes it
    modalOverlay.addEventListener('click', (ev) => {
      if (ev.target === modalOverlay) closeEditModal();
    });
  }
  if (modalForm) {
    modalForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!editingTxId) return;
      const msg = document.getElementById('txModalMsg');
      if (msg) {
        msg.textContent = '';
        msg.className = 'message';
      }

      const payload = {
        date: document.getElementById('txEditDate')?.value,
        description: document.getElementById('txEditDesc')?.value,
        type: document.getElementById('txEditType')?.value,
        amount: document.getElementById('txEditAmount')?.value,
        vatRate: document.getElementById('txEditVat')?.value,
        category: document.getElementById('txEditCategory')?.value,
      };

      try {
        const res = await fetch('/api/transactions/' + encodeURIComponent(editingTxId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Fout bij opslaan');
        await reload();
        closeEditModal();
      } catch (e) {
        console.error(e);
        if (msg) {
          msg.textContent = 'Kon transactie niet opslaan.';
          msg.className = 'message error';
        }
      }
    });
  }

      // --- Drawer wiring (Jortt-achtige detail/edit) ---
    const drawerClose = document.getElementById('txDrawerClose');
    const drawerOverlay = document.getElementById('txDrawer');
    const drawerEditBtn = document.getElementById('txDrawerEditBtn');
    const drawerAttachBtn = document.getElementById('txDrawerAttachBtn');
    const drawerDeleteBtn = document.getElementById('txDrawerDeleteBtn');
    const drawerCancel = document.getElementById('txDrawerCancel');
    const drawerForm = document.getElementById('txDrawerForm');

    const drawerTypeEl = document.getElementById('txDrawerType');
    if (drawerTypeEl) {
      drawerTypeEl.addEventListener('change', () => {
        const catSel = document.getElementById('txDrawerCategory');
        if (!catSel) return;
        fillCategorySelect(catSel, normalizeCategoryType(drawerTypeEl.value));
        catSel.value = '';
      });
    }

    const drop = document.getElementById('txDrawerDrop');
    const selectFileBtn = document.getElementById('txDrawerSelectFile');

    if (drawerClose) drawerClose.addEventListener('click', closeTxDrawer);
    if (drawerOverlay) {
      drawerOverlay.addEventListener('click', (ev) => {
        if (ev.target === drawerOverlay) closeTxDrawer();
      });
    }
    if (drawerEditBtn) drawerEditBtn.addEventListener('click', () => setDrawerMode(true));
    if (drawerCancel) drawerCancel.addEventListener('click', () => setDrawerMode(false));

    if (drawerAttachBtn) {
      drawerAttachBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (!drawerTx) return;
        if (drawerTx.attachmentData) {
          openAttachmentModal(drawerTx);
          return;
        }
        const input = document.getElementById('attachmentInput');
        if (!input) return;
        attachmentTxId = drawerTx.id;
        input.value = '';
        input.click();
      });
    }

    if (drawerDeleteBtn) {
      drawerDeleteBtn.addEventListener('click', async () => {
        if (!drawerTx) return;
        if (!confirm('Weet je zeker dat je deze transactie wilt verwijderen?')) return;
        await fetch('/api/transactions/' + encodeURIComponent(drawerTx.id), { method: 'DELETE' });
        closeTxDrawer();
        await reload();
      });
    }

    if (selectFileBtn) {
      selectFileBtn.addEventListener('click', () => {
        if (!drawerTx) return;
        const input = document.getElementById('attachmentInput');
        if (!input) return;
        attachmentTxId = drawerTx.id;
        input.value = '';
        input.click();
      });
    }

    if (drop) {
      const onDrag = (e) => { e.preventDefault(); drop.classList.add('dragover'); };
      const onLeave = (e) => { e.preventDefault(); drop.classList.remove('dragover'); };
      drop.addEventListener('dragover', onDrag);
      drop.addEventListener('dragenter', onDrag);
      drop.addEventListener('dragleave', onLeave);
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('dragover');
        if (!drawerTx) return;
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        const input = document.getElementById('attachmentInput');
        if (!input) return;
        attachmentTxId = drawerTx.id;
        // put file into input via DataTransfer
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
      });
    }

    if (drawerForm) {
      drawerForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!drawerTx) return;

        const msg = document.getElementById('txDrawerMsg');
        if (msg) { msg.textContent = ''; msg.className = 'message'; }

        const payload = {
          date: document.getElementById('txDrawerDate')?.value,
          description: document.getElementById('txDrawerDesc')?.value,
          type: document.getElementById('txDrawerType')?.value,
          amount: document.getElementById('txDrawerAmount')?.value,
          vatRate: document.getElementById('txDrawerVat')?.value,
          category: document.getElementById('txDrawerCategory')?.value,
          paymentMethod: document.getElementById('txDrawerPaymentMethod')?.value,
        };

        try {
          const res = await fetch('/api/transactions/' + encodeURIComponent(drawerTx.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error('Fout bij opslaan');
          await reload();
          // refresh drawerTx with updated tx from lastFilteredTransactions if present
          const updated = (lastFilteredTransactions || []).find((t) => t.id === drawerTx.id);
          drawerTx = updated || drawerTx;
          setDrawerMode(false);
        } catch (e) {
          console.error(e);
          if (msg) { msg.textContent = 'Kon transactie niet opslaan.'; msg.className = 'message error'; }
        }
      });
    }

// --- Attachment wiring (paperclip) ---
  
  const attachmentInput = document.getElementById('attachmentInput');
  if (attachmentInput) {
    attachmentInput.addEventListener('change', async () => {
      const file = attachmentInput.files && attachmentInput.files[0];
      const txId = attachmentModalTxId || attachmentTxId;
      if (!file || !txId) return;

      // Basic size guard (10 MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('Bestand is te groot (max 10 MB).');
        attachmentTxId = null;
        attachmentInput.value = '';
        return;
      }

      try {
        await saveAttachmentToTx(txId, file);
      } catch (e) {
        console.error(e);
        alert('Kon bijlage niet koppelen.');
      } finally {
        attachmentTxId = null;
        attachmentInput.value = '';
      }
    });
  }

  // Attachment popup (open / close / upload / remove)
  const attCloseBtn = document.getElementById('attModalClose');
  if (attCloseBtn) attCloseBtn.addEventListener('click', closeAttachmentModal);

  const attOverlay = document.getElementById('attModal');
  if (attOverlay) {
    attOverlay.addEventListener('click', (e) => {
      if (e.target === attOverlay) closeAttachmentModal();
    });
  }

  const attSelectBtn = document.getElementById('attSelectBtn');
  const attReplaceBtn = document.getElementById('attReplaceBtn');
  if (attSelectBtn) attSelectBtn.addEventListener('click', () => {
    if (!attachmentModalTxId) return;
    attachmentTxId = attachmentModalTxId;
    const input = document.getElementById('attachmentInput');
    if (!input) return;
    input.value = '';
    input.click();
  });
  if (attReplaceBtn) attReplaceBtn.addEventListener('click', () => {
    if (!attachmentModalTxId) return;
    attachmentTxId = attachmentModalTxId;
    const input = document.getElementById('attachmentInput');
    if (!input) return;
    input.value = '';
    input.click();
  });

  const attRemoveBtn = document.getElementById('attRemoveBtn');
  if (attRemoveBtn) attRemoveBtn.addEventListener('click', async () => {
    if (!attachmentModalTxId) return;
    const tx = transactions.find(t => t.id === attachmentModalTxId);
    if (!tx) return;
    tx.attachmentData = null;
    tx.attachmentName = null;
    await saveTransactions();
    renderCurrentView();
    closeAttachmentModal();
    // If drawer is open for this tx, update it
    if (drawerTx && drawerTx.id === attachmentModalTxId) {
      drawerTx.attachmentData = null;
      drawerTx.attachmentName = null;
      renderTxDrawer();
    }
  });

  const dropzone = document.getElementById('attDropzone');
  if (dropzone) {
    const setOver = (on) => dropzone.classList.toggle('dragover', on);
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); setOver(true); });
    dropzone.addEventListener('dragleave', () => setOver(false));
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault(); setOver(false);
      if (!attachmentModalTxId) return;
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      try {
        await saveAttachmentToTx(attachmentModalTxId, file);
      } catch (err) {
        console.error(err);
        alert('Kon bijlage niet koppelen.');
      }
    });
  }

});
