/**
 * calendar.js – Calendario dividendi mensile
 * Mostra dividendi ricevuti (verde) e prossime ex-date previste (ambra).
 */

const Calendar = (() => {
  let _events = [];         // tutti gli eventi dal JSON
  let _currentDate = new Date();
  const _tooltip = document.createElement('div');

  const WEEKDAYS_IT = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
  const MONTHS_IT = [
    'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'
  ];

  // ── Colore dot per tipo evento ──────────────────────────────────────────────
  function dotClass(type) {
    switch (type) {
      case 'payment':           return 'payment';
      case 'ex_date':           return 'ex_date';
      case 'payment_predicted': return 'payment_pred';
      default:                  return 'payment';
    }
  }

  function typeLabel(type) {
    switch (type) {
      case 'payment':           return 'Dividendo ricevuto';
      case 'ex_date':           return 'Ex-date prevista';
      case 'payment_predicted': return 'Pagamento previsto';
      default:                  return type;
    }
  }

  // ── Raggruppa eventi per data ───────────────────────────────────────────────
  function buildDateMap(events) {
    const map = {};
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }

  // ── Formatta data ISO → "GG/MM/AAAA" ──────────────────────────────────────
  function fmtDate(isoStr) {
    const [y, m, d] = isoStr.split('-');
    return `${d}/${m}/${y}`;
  }

  // ── Formatta importo ────────────────────────────────────────────────────────
  function fmtAmt(amount, currency) {
    if (!amount && amount !== 0) return '';
    try {
      return new Intl.NumberFormat('it-IT', {
        style: 'currency', currency: currency || 'EUR',
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${parseFloat(amount).toFixed(2)} ${currency || ''}`;
    }
  }

  // ── Genera link alla pagina del simbolo su TradingView ──────────────────────
  function tradingViewLink(t212Ticker) {
    if (!t212Ticker) return null;
    const parts = t212Ticker.split('_');
    const sym = parts[0];
    // Il link di TradingView è generalmente /symbols/{TICKER}/
    // Es: https://www.tradingview.com/symbols/NASDAQ-GAIN/
    // Il redirect automatico di TradingView gestirà la maggior parte dei casi.
    // Per sicurezza, usiamo il ticker base.
    return `https://www.tradingview.com/symbols/${encodeURIComponent(sym)}/`;
  }

  // ── Render tooltip ──────────────────────────────────────────────────────────
  function showTooltip(dayEvents, x, y) {
    let html = '';
    for (const ev of dayEvents) {
      const link = (ev.type === 'ex_date') ? tradingViewLink(ev.ticker) : null;
      const predictionLabel = ev.predicted 
          ? '<div class="cal-tooltip-row" style="color:var(--amber);font-size:.7rem">⚠ Stima basata sullo storico</div>'
          : '<div class="cal-tooltip-row" style="color:var(--green);font-size:.7rem">✓ Data confermata da TradingView</div>';

      html += `<div style="margin-bottom:.5rem; padding-bottom:.5rem; border-bottom:1px solid var(--border-2)">
        <div class="cal-tooltip-title">${escHtml(ev.name || ev.ticker)}</div>
        <div class="cal-tooltip-row">${typeLabel(ev.type)}</div>
        ${ev.amount > 0
          ? `<div class="cal-tooltip-row">Importo: <span>${fmtAmt(ev.amount, ev.currency)}</span></div>`
          : ''}
        ${ev.payment_date
          ? `<div class="cal-tooltip-row">Pagamento: <span>${fmtDate(ev.payment_date)}</span></div>`
          : ''}
        ${(ev.type === 'ex_date') ? predictionLabel : ''}
        ${link
          ? `<div style="margin-top:.3rem"><a href="${link}" target="_blank" rel="noopener"
               style="color:var(--blue);font-size:.72rem;text-decoration:none">🔗 Verifica su TradingView ↗</a></div>`
          : ''}
      </div>`;
    }
    html = html.replace(/<\/div>$/, '').trimEnd();

    _tooltip.innerHTML = html;
    _tooltip.classList.add('visible');

    // Posiziona il tooltip vicino al clic, evitando di uscire dallo schermo
    const tw = 240, th = 150;
    const vw = window.innerWidth, vh = window.innerHeight;
    let tx = x + 12, ty = y + 12;
    if (tx + tw > vw) tx = x - tw - 12;
    if (ty + th > vh) ty = y - th - 12;
    _tooltip.style.left = tx + 'px';
    _tooltip.style.top  = ty + 'px';
  }

  function hideTooltip() {
    _tooltip.classList.remove('visible');
  }

  // ── Render griglia ─────────────────────────────────────────────────────────
  function render() {
    const grid      = document.getElementById('cal-grid');
    const titleEl   = document.getElementById('cal-title');
    if (!grid || !titleEl) return;

    const year  = _currentDate.getFullYear();
    const month = _currentDate.getMonth(); // 0-based

    titleEl.textContent = `${MONTHS_IT[month]} ${year}`;

    const dateMap = buildDateMap(_events);

    // Primo giorno del mese (0=dom … 6=sab) → converti a lunedì=0
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const startOffset = (firstDay + 6) % 7;             // 0=Mon

    const daysInMonth  = new Date(year, month + 1, 0).getDate();
    const daysInPrevMo = new Date(year, month, 0).getDate();

    const todayStr = new Date().toISOString().slice(0, 10);

    let cells = '';

    // Giorni del mese precedente
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = daysInPrevMo - i;
      const prevM = month === 0 ? 11 : month - 1;
      const prevY = month === 0 ? year - 1 : year;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells += buildCell(d, dateStr, dateMap, true, todayStr);
    }

    // Giorni del mese corrente
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells += buildCell(d, dateStr, dateMap, false, todayStr);
    }

    // Giorni del mese successivo
    const total = startOffset + daysInMonth;
    const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let d = 1; d <= remaining; d++) {
      const nextM = month === 11 ? 0 : month + 1;
      const nextY = month === 11 ? year + 1 : year;
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells += buildCell(d, dateStr, dateMap, true, todayStr);
    }

    grid.innerHTML = cells;

    // Aggiungi listeners per tooltip
    grid.querySelectorAll('.cal-day.has-event').forEach(cell => {
      cell.addEventListener('click', (e) => {
        const dateStr = cell.dataset.date;
        const dayEvs  = dateMap[dateStr] || [];
        showTooltip(dayEvs, e.clientX, e.clientY);
        e.stopPropagation();
      });
    });
  }

  function buildCell(dayNum, dateStr, dateMap, otherMonth, todayStr) {
    const evs = dateMap[dateStr] || [];
    const classes = [
      'cal-day',
      otherMonth   ? 'other-month' : '',
      dateStr === todayStr ? 'today' : '',
      evs.length   ? 'has-event' : '',
    ].filter(Boolean).join(' ');

    const dots = evs.map(ev =>
      `<span class="cal-dot ${dotClass(ev.type)}" title="${escHtml(typeLabel(ev.type))}"></span>`
    ).join('');

    return `<div class="${classes}" data-date="${dateStr}">
      <span class="cal-day-num">${dayNum}</span>
      ${dots ? `<div class="cal-dots">${dots}</div>` : ''}
    </div>`;
  }

  // ── API pubblica ────────────────────────────────────────────────────────────
  function init(events) {
    _events = events || [];

    // Setup tooltip DOM
    _tooltip.className = 'cal-tooltip';
    document.body.appendChild(_tooltip);
    // Chiudi tooltip solo se il click è FUORI dal tooltip
    document.addEventListener('click', (e) => {
      if (!_tooltip.contains(e.target)) hideTooltip();
    });

    // Bottoni navigazione
    document.getElementById('cal-prev')?.addEventListener('click', () => {
      _currentDate.setMonth(_currentDate.getMonth() - 1);
      render();
    });
    document.getElementById('cal-next')?.addEventListener('click', () => {
      _currentDate.setMonth(_currentDate.getMonth() + 1);
      render();
    });
    document.getElementById('cal-today')?.addEventListener('click', () => {
      _currentDate = new Date();
      render();
    });

    render();
  }

  function update(events) {
    _events = events || [];
    render();
  }

  // ── Helper ──────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init, update };
})();
