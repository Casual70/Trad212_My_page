/**
 * app.js – Logica principale della dashboard T212
 *
 * Flusso:
 *  1. init()        → controlla sessionStorage, mostra auth gate o dashboard
 *  2. authenticate()→ hash SHA-256 della password, confronta con data/config.json
 *  3. loadData()    → scarica tutti i JSON in parallelo
 *  4. render*()     → popola schede, tabelle, grafici, calendario
 */

/* ── Stato applicazione ───────────────────────────────────────────────────── */
const AppState = {
  summary:      null,
  positions:    [],
  dividends:    [],
  monthly:      [],
  upcoming:     [],
  calendar:     [],
  lastUpdated:  null,
  currency:     'EUR',
};

/* ── Utility ──────────────────────────────────────────────────────────────── */
function fmt(amount, currency) {
  const cur = currency || AppState.currency || 'EUR';
  try {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency', currency: cur,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount ?? 0);
  } catch {
    return `${parseFloat(amount ?? 0).toFixed(2)} ${cur}`;
  }
}

function fmtPct(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${parseFloat(value).toFixed(2)}%`;
}

function fmtDate(isoStr) {
  if (!isoStr) return '–';
  try {
    return new Date(isoStr).toLocaleDateString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return isoStr.slice(0, 10); }
}

function fmtQty(qty) {
  const n = parseFloat(qty ?? 0);
  // Mostra fino a 6 decimali per le frazioni, ma nessun decimale per interi
  if (Number.isInteger(n)) return n.toLocaleString('it-IT');
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str ?? '')));
  return d.innerHTML;
}

function plClass(value) {
  return parseFloat(value) >= 0 ? 'text-green' : 'text-red';
}

/* ── Autenticazione ───────────────────────────────────────────────────────── */
async function computeSHA256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function authenticate() {
  const input   = document.getElementById('password-input');
  const errorEl = document.getElementById('auth-error');
  const btn     = document.getElementById('auth-btn');

  if (!input?.value) return;

  btn.disabled = true;
  btn.textContent = 'Accesso…';
  errorEl.textContent = '';

  try {
    const resp = await fetch('data/config.json');

    if (!resp.ok) {
      // config.json non ancora generato (primo deploy senza credenziali T212):
      // accetta qualsiasi password finché il workflow non gira con SITE_PASSWORD.
      const hash = await computeSHA256(input.value);
      sessionStorage.setItem('t212-auth', hash);
      await showDashboard();
      return;
    }

    const config = await resp.json();
    const hash   = await computeSHA256(input.value);

    if (hash === config.password_hash) {
      sessionStorage.setItem('t212-auth', hash);
      await showDashboard();
    } else {
      errorEl.textContent = 'Password non corretta. Riprova.';
      input.value = '';
      input.focus();
    }
  } catch (e) {
    errorEl.textContent = 'Errore di rete. Controlla la connessione.';
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Accedi';
  }
}

function checkAuth() {
  return !!sessionStorage.getItem('t212-auth');
}

function logout() {
  sessionStorage.removeItem('t212-auth');
  location.reload();
}

/* ── Caricamento dati ─────────────────────────────────────────────────────── */
async function fetchJSON(path, cacheBust = true) {
  const url = cacheBust ? `${path}?v=${Date.now()}` : path;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} per ${path}`);
  return r.json();
}

async function loadData() {
  try {
    const [summary, positions, dividends, monthly, upcoming, calendar, lastUpdated, config] =
      await Promise.all([
        fetchJSON('data/summary.json'),
        fetchJSON('data/positions.json'),
        fetchJSON('data/dividends.json'),
        fetchJSON('data/monthly.json'),
        fetchJSON('data/upcoming.json'),
        fetchJSON('data/calendar.json'),
        fetchJSON('data/last_updated.json'),
        fetchJSON('data/config.json', false).catch(() => ({ currency: 'EUR' })), // config.json non cambia spesso
      ]);

    Object.assign(AppState, {
      summary, positions, dividends, monthly, upcoming, calendar, lastUpdated,
      currency: config.currency || summary?.currency || 'EUR',
    });

    renderDashboard();
  } catch (err) {
    console.error(err);
    const errEl = document.getElementById('data-error');
    if (errEl) {
      errEl.textContent =
        'Impossibile caricare i dati del portafoglio. ' +
        'Assicurati di aver configurato i segreti GitHub (T212_API_KEY, T212_API_SECRET, SITE_PASSWORD) ' +
        'e di aver eseguito il workflow "Fetch Dati T212 & Deploy Dashboard" almeno una volta.';
      errEl.classList.remove('hidden');
    }
  } finally {
    document.getElementById('loader')?.classList.add('hidden');
    document.getElementById('dashboard-content')?.classList.remove('hidden');
  }
}

/* ── Render dashboard ─────────────────────────────────────────────────────── */
function renderDashboard() {
  const { summary, positions, dividends, monthly, upcoming, calendar, lastUpdated, currency } = AppState;

  // Timestamp ultimo aggiornamento
  if (lastUpdated?.timestamp) {
    const ts = new Date(lastUpdated.timestamp);
    document.getElementById('last-updated').textContent = ts.toLocaleString('it-IT');
  }

  // Badge demo
  if (lastUpdated?.demo) {
    document.getElementById('demo-badge')?.classList.remove('hidden');
  }

  // Schede riepilogo
  renderSummaryCards(summary, dividends, currency);

  // Grafici
  Charts.updateMonthly(monthly, currency);
  Charts.updateAllocation(positions, currency);

  // Calendario
  Calendar.update(calendar);

  // Prossimi dividendi (sidebar)
  renderUpcoming(upcoming, currency);

  // Tabella posizioni
  renderPositionsTable(positions, currency);

  // Storico dividendi
  renderDividendsTable(dividends, currency);
}

/* ── Schede riepilogo ─────────────────────────────────────────────────────── */
function renderSummaryCards(summary, dividends, currency) {
  if (!summary) return;

  const totalValue    = summary.totalValue ?? 0;
  const unrealizedPL  = summary.investments?.unrealizedProfitLoss ?? 0;
  const realizedPL    = summary.investments?.realizedProfitLoss   ?? 0;
  const cash          = summary.cash?.availableToTrade            ?? 0;
  const totalCost     = summary.investments?.totalCost            ?? 1;
  const unrealizedPct = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;

  const totalDividends = (dividends || []).reduce((s, d) => s + (d.amount || 0), 0);

  setCard('card-total',       fmt(totalValue, currency), null);
  setCard('card-unrealized',  fmt(unrealizedPL, currency), unrealizedPL, fmtPct(unrealizedPct));
  setCard('card-realized',    fmt(realizedPL, currency),  realizedPL);
  setCard('card-cash',        fmt(cash, currency),         null);
  setCard('card-dividends',   fmt(totalDividends, currency), null);
}

function setCard(id, mainText, colorValue, subText = '') {
  const el = document.getElementById(id);
  if (!el) return;
  const valEl = el.querySelector('.summary-card-value');
  const subEl = el.querySelector('.summary-card-sub');
  if (valEl) {
    valEl.textContent = mainText;
    valEl.className   = 'summary-card-value';
    if (colorValue !== null && colorValue !== undefined) {
      valEl.classList.add(colorValue >= 0 ? 'text-green' : 'text-red');
    }
  }
  if (subEl && subText) {
    subEl.textContent = subText;
    subEl.className   = 'summary-card-sub';
    if (colorValue !== null && colorValue !== undefined) {
      subEl.classList.add(colorValue >= 0 ? 'text-green' : 'text-red');
    }
  }
}

/* ── Tabella posizioni ────────────────────────────────────────────────────── */
function renderPositionsTable(positions, currency) {
  const tbody = document.getElementById('positions-tbody');
  if (!tbody) return;

  if (!positions || positions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:2rem">
      Nessuna posizione aperta.</td></tr>`;
    return;
  }

  const sorted = [...positions].sort(
    (a, b) => (b.walletImpact?.currentValue || 0) - (a.walletImpact?.currentValue || 0)
  );

  tbody.innerHTML = sorted.map(p => {
    const name        = p.instrument?.name  || p.ticker || '–';
    const ticker      = p.instrument?.ticker || p.ticker || '–';
    const qty         = p.quantity || 0;
    const avgPrice    = p.averagePricePaid || 0;
    const currPrice   = p.currentPrice || 0;
    const curVal      = p.walletImpact?.currentValue || 0;
    const cost        = p.walletImpact?.totalCost || 0;
    const unPL        = p.walletImpact?.unrealizedProfitLoss || 0;
    const pct         = cost > 0 ? (unPL / cost) * 100 : 0;
    const instrCur    = p.instrument?.currency || 'USD';

    const change = currPrice > 0 && avgPrice > 0
      ? ((currPrice - avgPrice) / avgPrice * 100) : 0;

    return `<tr>
      <td>
        <div class="td-name-main">${escHtml(name)}</div>
        <div class="td-name-sub">${escHtml(ticker)}</div>
      </td>
      <td class="td-right">${fmtQty(qty)}</td>
      <td class="td-right">${fmt(avgPrice, instrCur)}</td>
      <td class="td-right">
        <span>${fmt(currPrice, instrCur)}</span>
        <span class="${plClass(change)}" style="font-size:.72rem;margin-left:.25rem">(${fmtPct(change)})</span>
      </td>
      <td class="td-right" style="font-weight:600">${fmt(curVal, currency)}</td>
      <td class="td-right ${plClass(unPL)}">
        <div>${fmt(unPL, currency)}</div>
        <div style="font-size:.73rem">${fmtPct(pct)}</div>
      </td>
    </tr>`;
  }).join('');

  // Aggiorna contatore
  const countEl = document.getElementById('positions-count');
  if (countEl) countEl.textContent = `${positions.length} posizioni`;
}

/* ── Storico dividendi ────────────────────────────────────────────────────── */
function renderDividendsTable(dividends, currency) {
  const tbody = document.getElementById('dividends-tbody');
  if (!tbody) return;

  if (!dividends || dividends.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:2rem">
      Nessun dividendo nello storico.</td></tr>`;
    return;
  }

  const sorted = [...dividends]
    .sort((a, b) => new Date(b.paidOn) - new Date(a.paidOn))
    .slice(0, 100);

  tbody.innerHTML = sorted.map(d => {
    const name    = d.instrument?.name || d.ticker || '–';
    const ticker  = d.ticker || d.instrument?.ticker || '–';
    const paidOn  = fmtDate(d.paidOn);
    const qty     = d.quantity || 0;
    const gross   = d.grossAmountPerShare || 0;
    const amount  = d.amount || 0;
    const type    = dividendTypeLabel(d.type);

    return `<tr>
      <td>
        <div class="td-name-main">${escHtml(name)}</div>
        <div class="td-name-sub">${escHtml(ticker)}</div>
      </td>
      <td>${paidOn}</td>
      <td class="td-right">${fmtQty(qty)}</td>
      <td class="td-right" style="color:var(--text-2)">${gross > 0 ? gross.toFixed(4) : '–'}</td>
      <td class="td-right text-green" style="font-weight:600">${fmt(amount, currency)}</td>
    </tr>`;
  }).join('');

  const countEl = document.getElementById('dividends-count');
  if (countEl) countEl.textContent = `${dividends.length} pagamenti`;
}

function dividendTypeLabel(type) {
  const map = {
    ORDINARY: 'Ordinario', BONUS: 'Bonus', INTEREST: 'Interesse',
    RETURN_OF_CAPITAL_NON_US: 'Rimborso capitale',
    CAPITAL_GAINS_DISTRIBUTION_NON_US: 'Plusvalenza',
    DEMERGER: 'Scissione',
  };
  return map[type] || (type ? type.replace(/_/g, ' ') : '–');
}

/* ── Prossimi dividendi (previsioni) ─────────────────────────────────────── */
function renderUpcoming(upcoming, currency) {
  const container = document.getElementById('upcoming-list');
  if (!container) return;

  const today = new Date().toISOString().slice(0, 10);
  const future = (upcoming || [])
    .filter(u => u.next_ex_date >= today)
    .slice(0, 15);

  if (future.length === 0) {
    container.innerHTML = '<p style="color:var(--text-3);font-size:.85rem;padding:.5rem 0">Nessuna previsione disponibile.</p>';
    return;
  }

  container.innerHTML = future.map(u => `
    <div class="upcoming-item">
      <div>
        <div class="upcoming-name">${escHtml(u.name)}</div>
        <div class="upcoming-meta">${escHtml(u.ticker)} · ${escHtml(u.frequency)}</div>
      </div>
      <div class="upcoming-dates">
        <div class="upcoming-ex">Ex: ${fmtDate(u.next_ex_date)}</div>
        <div class="upcoming-pay">Pag: ${fmtDate(u.next_payment_date)}</div>
        ${u.amount_est > 0 ? `<div class="upcoming-amt">~${fmt(u.amount_est, currency)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

/* ── Visibilità ───────────────────────────────────────────────────────────── */
async function showDashboard() {
  document.getElementById('auth-gate').classList.add('hidden');
  const app = document.getElementById('app');
  app.classList.remove('hidden');
  document.getElementById('loader').classList.remove('hidden');
  document.getElementById('dashboard-content').classList.add('hidden');
  await loadData();
}

/* ── Init ─────────────────────────────────────────────────────────────────── */
async function init() {
  // Listener per Enter sul campo password
  document.getElementById('password-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') authenticate();
  });

  if (checkAuth()) {
    await showDashboard();
  } else {
    document.getElementById('auth-gate').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', init);
