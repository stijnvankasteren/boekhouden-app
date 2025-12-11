let currentView = 'dashboard';
let lastData = {
  transactions: [],
  summary: { totalIncome: 0, totalExpenses: 0, result: 0 },
};

// The currently loaded settings.  Updated whenever loadSettings runs.  Used
// throughout the UI to adapt text (e.g. displaying the chosen year).
let currentSettings = null;

const sheetCache = {};

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
    if (brandSubtitle) brandSubtitle.textContent = 'Jaar ' + (settings.year || new Date().getFullYear()) + ' — Simpele webversie';
    applyTheme(settings);
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
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'Nog geen data voor dit tabblad';
    cell.style.textAlign = 'center';
    cell.style.color = '#6b7280';
    row.appendChild(cell);
    tbody.appendChild(row);
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

    const amountCell = document.createElement('td');
    amountCell.textContent = formatCurrency(tx.amount);
    amountCell.style.textAlign = 'right';
    row.appendChild(amountCell);

    const actionCell = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'Verwijderen';
    btn.style.background = '#ef4444';
    btn.style.fontSize = '0.75rem';
    btn.style.padding = '0.25rem 0.5rem';
    btn.addEventListener('click', async () => {
      if (!confirm('Transactie verwijderen?')) return;
      await fetch('/api/transactions/' + encodeURIComponent(tx.id), {
        method: 'DELETE',
      });
      await reload();
    });
    actionCell.appendChild(btn);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  }
}

// Update the btw-aangifte table based on the computed summary.  The table is
// expected to have at least three rows: omzet hoog tarief, omzet laag tarief
// (unused for now) and voorbelasting.  The amounts are filled in with the
// amounts excluding VAT and the VAT amounts themselves.  When VAT is not
// enabled the values will be zero.
function updateBtwTable(summary) {
  const table = document.getElementById('btw-table');
  if (!table || !summary) return;
  const rows = table.querySelectorAll('tbody tr');
  if (rows.length < 3) return;
  const exclIncome = summary.totalIncome - summary.vatOnIncome;
  const exclExpenses = summary.totalExpenses - summary.vatOnExpenses;
  // Row 0: omzet hoog tarief
  rows[0].children[1].textContent = formatCurrency(exclIncome);
  rows[0].children[2].textContent = formatCurrency(summary.vatOnIncome);
  // Row 1: omzet laag tarief (not used in this simple version)
  rows[1].children[1].textContent = formatCurrency(0);
  rows[1].children[2].textContent = formatCurrency(0);
  // Row 2: voorbelasting (VAT on expenses)
  rows[2].children[1].textContent = formatCurrency(exclExpenses);
  rows[2].children[2].textContent = formatCurrency(summary.vatOnExpenses);
}

// Update the winst & verlies / balans table with totals from the summary.  The
// table is expected to have at least three rows: totale omzet, totaal
// uitgaven en resultaat.  Additional rows are ignored.
function updateWvTable(summary) {
  const table = document.getElementById('wv-table');
  if (!table || !summary) return;
  const rows = table.querySelectorAll('tbody tr');
  if (rows.length < 3) return;
  rows[0].children[1].textContent = formatCurrency(summary.totalIncome);
  rows[1].children[1].textContent = formatCurrency(summary.totalExpenses);
  rows[2].children[1].textContent = formatCurrency(summary.result);
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

  let txs = lastData.transactions;

  setLayoutForView(currentView);

  switch (currentView) {
    case 'dashboard':
      rightTitle.textContent = 'Transacties ' + (currentSettings ? currentSettings.year : '2025');
      rightCaption.textContent = 'Overzicht van alle mutaties (Dashboard).';
      break;
    case 'factuur':
      rightTitle.textContent = 'Factuur';
      rightCaption.textContent =
        'Factuurfunctionaliteit is nog niet geïmplementeerd in deze simpele versie.';
      txs = [];
      break;
    case 'income':
      rightTitle.textContent = 'Verkopen & Inkomsten';
      rightCaption.textContent = 'Alle inkomsten-transacties in 2025.';
      txs = txs.filter((t) => t.type !== 'expense');
      break;
    case 'expense':
      rightTitle.textContent = 'Inkopen & Uitgaven';
      rightCaption.textContent = 'Alle uitgaven-transacties in 2025.';
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
      rightCaption.textContent =
        'Overzicht van W&V en balans (waarden uit dit webbestand).';
      txs = [];
      // Fill the W&V/balans table using the latest summary
      updateWvTable(lastData.summary);
      break;
    case 'btw':
      rightTitle.textContent = 'Btw-aangifte';
      rightCaption.textContent =
        'Vul hier je btw-overzicht in zoals in het Excel-tabblad.';
      txs = [];
      // Update the VAT overview table using the latest summary
      updateBtwTable(lastData.summary);
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
      rightTitle.textContent = 'Transacties ' + (currentSettings ? currentSettings.year : '2025');
      rightCaption.textContent = 'Overzicht van alle mutaties.';
      break;
  }

  renderTable(txs);
  setSheetContent(currentView);
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
    applyView();
    updateSummary(lastData.summary);
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
  const type = document.getElementById('type').value;

  const msg = document.getElementById('formMessage');
  if (msg) {
    msg.textContent = '';
    msg.className = 'message';
  }

  try {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, description, amount, type }),
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
});
