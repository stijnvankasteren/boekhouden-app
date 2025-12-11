const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'transactions.json');
const SHEETS_DIR = path.join(DATA_DIR, 'sheets');
// Path to the settings file used to persist configuration such as VAT settings and theme
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}


function initStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]), 'utf8');
  }
  if (!fs.existsSync(SHEETS_DIR)) {
    fs.mkdirSync(SHEETS_DIR, { recursive: true });
  }

  // Initialise a default settings file if it does not yet exist.  This file stores
  // general application settings (company name, year, VAT configuration, theme
  // colour, etc.).  Without this file the application will fall back to
  // sensible defaults.  See `readSettings` for the fallback values.
  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = {
      company: 'SVK Beheer Holding B.V.',
      year: new Date().getFullYear(),
      vatEnabled: true,
      vatRate: 0.21,
      themeColor: '#2563eb',
      customCss: '',
      layout: {
        navOrder: null,
        panelOrder: null,
      },
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), 'utf8');
  }
}

function readTransactions() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading transactions:', e);
    return [];
  }
}


function readSheet(slug) {
  const safe = slug.replace(/[^a-z0-9_-]/g, '');
  if (!safe) return null;
  const file = path.join(SHEETS_DIR, safe + '.html');
  if (!fs.existsSync(file)) return null;
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('Error reading sheet', slug, e);
    return null;
  }
}

function writeSheet(slug, html) {
  const safe = slug.replace(/[^a-z0-9_-]/g, '');
  if (!safe) return false;
  try {
    const file = path.join(SHEETS_DIR, safe + '.html');
    ensureDir(SHEETS_DIR);
    fs.writeFileSync(file, String(html || ''), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing sheet', slug, e);
    return false;
  }
}

function writeTransactions(list) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing transactions:', e);
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function notFound(res) {
  res.statusCode = 404;
  res.end('Not found');
}

function serveStatic(req, res) {
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.join(__dirname, 'public', pathname);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    return notFound(res);
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    let contentType = 'text/plain; charset=utf-8';
    if (pathname.endsWith('.html')) contentType = 'text/html; charset=utf-8';
    else if (pathname.endsWith('.css')) contentType = 'text/css; charset=utf-8';
    else if (pathname.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

/**
 * Calculate summary statistics based on the list of transactions and supplied
 * settings.  In addition to the existing income/expense totals this
 * implementation also derives VAT on income and expenses and the net VAT
 * payable.  When VAT is disabled via the settings the VAT figures will be
 * zero and the total amounts remain untouched.
 *
 * @param {Array} list List of transaction objects {type: 'income' | 'expense', amount: number}
 * @param {Object} [settings] Optional settings object.  When not provided the
 * settings file will be read from disk.
 * @returns {Object} Summary containing totals and VAT values
 */
function calculateSummary(list, settings) {
  const cfg = settings || readSettings();
  const vatEnabled = !!cfg.vatEnabled;
  // Accept a VAT rate between 0 and 1; default to 0 when disabled
  const vatRate = vatEnabled ? Number(cfg.vatRate) || 0 : 0;
  let income = 0;
  let expenses = 0;
  let vatOnIncome = 0;
  let vatOnExpenses = 0;
  for (const tx of list) {
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
 * Read persisted settings from disk.  If the settings file does not exist or
 * cannot be parsed the function will return a set of sensible defaults.  The
 * returned object always includes all expected keys.
 */
function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Ensure layout property exists for backwards compatibility
    if (typeof data.layout !== 'object' || !data.layout) {
      data.layout = { navOrder: null, panelOrder: null };
    }
    return data;
  } catch (e) {
    console.error('Error reading settings:', e);
    return {
      company: 'SVK Beheer Holding B.V.',
      year: new Date().getFullYear(),
      vatEnabled: true,
      vatRate: 0.21,
      themeColor: '#2563eb',
      customCss: '',
      layout: {
        navOrder: null,
        panelOrder: null,
      },
    };
  }
}

/**
 * Persist settings to disk.  Returns true on success and false on failure.
 * Invalid JSON will cause an exception to be thrown by JSON.stringify.
 * @param {Object} settings The settings object to persist
 * @returns {boolean}
 */
function writeSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing settings:', e);
    return false;
  }
}

function handleApi(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (pathname === '/api/transactions' && req.method === 'GET') {
    const list = readTransactions();
    const settings = readSettings();
    return sendJson(res, 200, {
      transactions: list,
      summary: calculateSummary(list, settings),
      settings,
    });
  }

  if (pathname === '/api/transactions' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
      if (body.length > 1e6) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const list = readTransactions();
        const now = new Date();
        const id = Date.now().toString();

        const tx = {
          id,
          date: data.date || now.toISOString().slice(0, 10),
          description: data.description || '',
          amount: Number(data.amount) || 0,
          type: data.type === 'expense' ? 'expense' : 'income',
          createdAt: now.toISOString(),
        };

        list.push(tx);
        writeTransactions(list);
        const settings = readSettings();
        return sendJson(res, 201, {
          ok: true,
          transaction: tx,
          summary: calculateSummary(list, settings),
        });
      } catch (e) {
        console.error('Error parsing POST body:', e);
        return sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
      }
    });
    return;
  }

  if (pathname.startsWith('/api/transactions/') && req.method === 'DELETE') {
    const id = pathname.split('/').pop();
    const list = readTransactions();
    const newList = list.filter((t) => t.id !== id);
    writeTransactions(newList);
    const settings = readSettings();
    return sendJson(res, 200, {
      ok: true,
      summary: calculateSummary(newList, settings),
    });
  }



  if (pathname.startsWith('/api/sheets/')) {
    const slug = pathname.split('/').pop();
    if (!slug) {
      return sendJson(res, 400, { ok: false, error: 'Geen sheet opgegeven' });
    }

    if (req.method === 'GET') {
      const html = readSheet(slug);
      return sendJson(res, 200, { ok: true, html: html || null });
    }

    if (req.method === 'PUT') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString('utf8');
        if (body.length > 1e6) {
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const ok = writeSheet(slug, data.html || '');
          if (!ok) {
            return sendJson(res, 500, { ok: false, error: 'Kon sheet niet opslaan' });
          }
          return sendJson(res, 200, { ok: true });
        } catch (e) {
          console.error('Error parsing sheet body:', e);
          return sendJson(res, 400, { ok: false, error: 'Ongeldige JSON voor sheet' });
        }
      });
      return;
    }

    return sendJson(res, 405, { ok: false, error: 'Methode niet toegestaan' });
  }

  // API endpoints for reading and updating global settings
  if (pathname === '/api/settings') {
    if (req.method === 'GET') {
      const settings = readSettings();
      return sendJson(res, 200, settings);
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString('utf8');
        if (body.length > 1e6) {
          // Prevent abuse by limiting payload size
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const current = readSettings();
          const newSettings = Object.assign({}, current, {
            company:
              typeof data.company === 'string' && data.company.trim() !== ''
                ? data.company
                : current.company,
            year:
              typeof data.year === 'number' && !Number.isNaN(data.year)
                ? data.year
                : current.year,
            vatEnabled:
              typeof data.vatEnabled === 'boolean'
                ? data.vatEnabled
                : current.vatEnabled,
            vatRate:
              typeof data.vatRate === 'number' && !Number.isNaN(data.vatRate)
                ? data.vatRate
                : current.vatRate,
            themeColor:
              typeof data.themeColor === 'string' && data.themeColor.startsWith('#')
                ? data.themeColor
                : current.themeColor,
            customCss:
              typeof data.customCss === 'string'
                ? data.customCss
                : current.customCss,
            // Preserve layout configuration if provided, otherwise keep current layout
            layout:
              typeof data.layout === 'object' && data.layout
                ? Object.assign({}, current.layout || {}, data.layout)
                : current.layout,
          });
          if (!writeSettings(newSettings)) {
            return sendJson(res, 500, { ok: false, error: 'Kon instellingen niet opslaan' });
          }
          return sendJson(res, 200, { ok: true, settings: newSettings });
        } catch (e) {
          console.error('Error parsing settings body:', e);
          return sendJson(res, 400, { ok: false, error: 'Ongeldige JSON voor instellingen' });
        }
      });
      return;
    }
    return sendJson(res, 405, { ok: false, error: 'Methode niet toegestaan' });
  }
  return notFound(res);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    return handleApi(req, res);
  }
  return serveStatic(req, res);
});

initStorage();

server.listen(PORT, () => {
  console.log(`Boekhouding app running on http://0.0.0.0:${PORT}`);
});
