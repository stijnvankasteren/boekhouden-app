let currentView = 'dashboard';
let lastData = {
  transactions: [],
  summary: { totalIncome: 0, totalExpenses: 0, result: 0 },
};

const sheetCache = {};

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

    const res = await fetch('/api/sheets/' + encodeURIComponent(currentView), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });

    if (!res.ok) {
      throw new Error('Status ' + res.status);
    }

    sheetCache[currentView] = html;
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
      rightTitle.textContent = 'Transacties 2025';
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
      break;
    case 'btw':
      rightTitle.textContent = 'Btw-aangifte';
      rightCaption.textContent =
        'Vul hier je btw-overzicht in zoals in het Excel-tabblad.';
      txs = [];
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
      rightTitle.textContent = 'Transacties 2025';
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

  // extra navigatieknoppen binnen de pagina (bijv. op het dashboard)
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

  reload();
});
