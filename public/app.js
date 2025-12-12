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
function populateCategorySelect() {
  const categorySelect = document.getElementById('category');
  const typeSelect = document.getElementById('type');
  if (!categorySelect || !typeSelect) return;
  // Bepaal huidig type (income of expense)
  const currentType = typeSelect.value === 'expense' ? 'uitgave' : 'inkomst';
  const categories = (currentSettings && Array.isArray(currentSettings.categories))
    ? currentSettings.categories
    : [];
  // Filter categorieën op type
  const filtered = categories.filter((c) => c && c.type === currentType);
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
    if (tx.type === 'expense') {
      expenses += amount;
      if (vatRate > 0) {
        const vatPart = amount - amount / (1 + vatRate);
        vatOnExpenses += vatPart;
      }
    } else {
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

  const isTxView = view === 'dashboard' || view === 'income' || view === 'expense';

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

  for (const tx of transactions) {
    const row = document.createElement('tr');

    const dateCell = document.createElement('td');
    dateCell.textContent = tx.date;
    row.appendChild(dateCell);

    const descCell = document.createElement('td');
    descCell.textContent = tx.description;
    row.appendChild(descCell);

    const typeCell = document.createElement('td');
    typeCell.textContent = tx.type === 'expense' ? 'Uitgave' : 'Inkomst';
    typeCell.className =
      tx.type === 'expense' ? 'tx-type-expense' : 'tx-type-income';
    row.appendChild(typeCell);

    // Category cell: show selected category or '-' when none
    const catCell = document.createElement('td');
    catCell.textContent = tx.category ? tx.category : '-';
    row.appendChild(catCell);

    // VAT rate column (as percentage) next to category
    const vatRateCell = document.createElement('td');
    // Btw-percentage per transactie wordt opgeslagen als "21" / "9" / "0" (dus al in procenten).
    const txVatRate = Number(tx.vatRate ?? tx.vat_rate ?? 0) || 0;
    vatRateCell.textContent = String(txVatRate) + '%';
    vatRateCell.style.textAlign = 'right';
    row.appendChild(vatRateCell);

    const amountExclCell = document.createElement('td');
    const baseAmount = Number(tx.amount) || 0;
    const vatAmount = baseAmount * (txVatRate / 100);
    const amountIncl = baseAmount + vatAmount;

    amountExclCell.textContent = formatCurrency(baseAmount);
    amountExclCell.style.textAlign = 'right';
    row.appendChild(amountExclCell);

    const vatCell = document.createElement('td');
    vatCell.textContent = formatCurrency(vatAmount);
    vatCell.style.textAlign = 'right';
    row.appendChild(vatCell);

    const amountInclCell = document.createElement('td');
    amountInclCell.textContent = formatCurrency(amountIncl);
    amountInclCell.style.textAlign = 'right';
    row.appendChild(amountInclCell);

    const actionCell = document.createElement('td');
    const stack = document.createElement('div');
    stack.className = 'action-stack';

    // Edit (pencil) button
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.type = 'button';
    editBtn.textContent = '✏️';
    editBtn.title = 'Transactie bewerken';
    editBtn.addEventListener('click', () => openEditModal(tx));
    stack.appendChild(editBtn);

    // Attachment (paperclip) button
    const attBtn = document.createElement('button');
    attBtn.className = 'icon-btn' + (tx.attachmentData ? ' attached' : '');
    attBtn.type = 'button';
    attBtn.textContent = '📎';
    attBtn.title = tx.attachmentData ? 'Bijlage bekijken' : 'Bon/factuur koppelen';
    attBtn.addEventListener('click', () => {
      if (tx.attachmentData) {
        // Open in a new tab/window (data URL)
        window.open(tx.attachmentData, '_blank', 'noopener');
        return;
      }
      const input = document.getElementById('attachmentInput');
      if (!input) return;
      attachmentTxId = tx.id;
      input.value = '';
      input.click();
    });
    stack.appendChild(attBtn);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Verwijderen';
    delBtn.style.background = '#ef4444';
    delBtn.style.fontSize = '0.75rem';
    delBtn.style.padding = '0.25rem 0.5rem';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Transactie verwijderen?')) return;
      await fetch('/api/transactions/' + encodeURIComponent(tx.id), {
        method: 'DELETE',
      });
      await reload();
    });
    stack.appendChild(delBtn);

    actionCell.appendChild(stack);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  }
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
  if (typeEl) typeEl.value = tx.type === 'expense' ? 'expense' : 'income';
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
      map.set(key, { income: 0, expense: 0 });
    }
    const bucket = map.get(key);
    const amount = Number(tx.amount) || 0;
    if (tx.type === 'expense') {
      bucket.expense += amount;
    } else {
      bucket.income += amount;
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
    tdLoss.textContent = bucket.expense ? formatCurrency(bucket.expense) : '';
    tdProfit.textContent = bucket.income ? formatCurrency(bucket.income) : '';

    totalIncome += bucket.income;
    totalExpenses += bucket.expense;

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
  enhanceSheetUi(root);
}

function enhanceSheetUi(root) {
  if (!root) return;

  root.querySelectorAll('[data-action="add-row"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      let table = null;

      if (targetId) {
        table = root.querySelector('#' + targetId);
      }
      if (!table) {
        const section = btn.closest('.sheet-section');
        if (section) {
          table = section.querySelector('table');
        }
      }

      if (table) {
        addRowToTable(table);
      }
    });
  });
}

function addRowToTable(table) {
  if (!table) return;
  const headRow = table.querySelector('thead tr');
  const colCount = headRow ? headRow.children.length : 1;
  const tbody = table.querySelector('tbody') || table.createTBody();
  const tr = document.createElement('tr');

  for (let i = 0; i < colCount; i++) {
    const td = document.createElement('td');
    td.setAttribute('contenteditable', 'true');
    tr.appendChild(td);
  }

  tbody.appendChild(tr);
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
    makeSheetEditable(container);
    return;
  }

  const tpl = document.getElementById('tpl-' + view);
  if (tpl && tpl.content) {
    const fragment = tpl.content.cloneNode(true);
    container.appendChild(fragment);
    // Als we naar het categorieën-tabblad gaan, vul dan de tabel met de
    // bestaande categorieën uit de instellingen (currentSettings.categories).
    if (view === 'categories' && currentSettings && Array.isArray(currentSettings.categories)) {
      const table = container.querySelector('#category-table');
      if (table) {
        const tbody = table.querySelector('tbody');
        if (tbody) {
          tbody.innerHTML = '';
          currentSettings.categories.forEach((cat) => {
            const tr = document.createElement('tr');
            const tdName = document.createElement('td');
            tdName.textContent = cat.name || '';
            const tdType = document.createElement('td');
            tdType.textContent = cat.type || '';
            const tdNotes = document.createElement('td');
            tdNotes.textContent = cat.notes || '';
            tr.appendChild(tdName);
            tr.appendChild(tdType);
            tr.appendChild(tdNotes);
            tbody.appendChild(tr);
          });
        }
      }
    }
    makeSheetEditable(container);
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
        makeSheetEditable(container);
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
            const type = cells[1].textContent.trim();
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
    case 'income':
      rightTitle.textContent = 'Verkopen & Inkomsten';
      rightCaption.textContent =
        'Alle inkomsten-transacties ' + (yearText === 'alle jaren' ? '' : 'in ' + yearText + '.');
      txs = txs.filter((t) => t.type !== 'expense');
      break;
    case 'expense':
      rightTitle.textContent = 'Inkopen & Uitgaven';
      rightCaption.textContent =
        'Alle uitgaven-transacties ' + (yearText === 'alle jaren' ? '' : 'in ' + yearText + '.');
      txs = txs.filter((t) => t.type === 'expense');
      break;
    case 'categories':
      rightTitle.textContent = 'Categorieën';
      rightCaption.textContent =
        'Beheer hier je categorieën zoals in het Excel-tabblad.';
      txs = [];
      break;
    case 'accounts':
      rightTitle.textContent = 'Rekeningen';
      rightCaption.textContent =
        'Beheer hier je rekeningen zoals in het Excel-tabblad.';
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
    if (toolbar) toolbar.style.display = '';
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

window.addEventListener('DOMContentLoaded', () => {
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

  // --- Attachment wiring (paperclip) ---
  const attachmentInput = document.getElementById('attachmentInput');
  if (attachmentInput) {
    attachmentInput.addEventListener('change', async () => {
      const file = attachmentInput.files && attachmentInput.files[0];
      if (!file || !attachmentTxId) return;

      // Basic size guard (10 MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('Bestand is te groot (max 10 MB).');
        attachmentTxId = null;
        attachmentInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = String(reader.result || '');
          const res = await fetch('/api/transactions/' + encodeURIComponent(attachmentTxId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachmentName: file.name, attachmentData: dataUrl }),
          });
          if (!res.ok) throw new Error('Upload mislukt');
          await reload();
        } catch (e) {
          console.error(e);
          alert('Kon bijlage niet koppelen.');
        } finally {
          attachmentTxId = null;
          attachmentInput.value = '';
        }
      };
      reader.readAsDataURL(file);
    });
  }
});
