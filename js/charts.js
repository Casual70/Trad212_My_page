/**
 * charts.js – Grafici Chart.js per la dashboard T212
 *
 *  - Grafico a barre: dividendi mensili (ultimi 18 mesi)
 *  - Grafico donut:   allocazione portafoglio per valore corrente
 */

const Charts = (() => {
  let monthlyChart = null;
  let allocationChart = null;

  // Palette colori per il donut (26 colori distinti)
  const PALETTE = [
    '#3b82f6','#22c55e','#f59e0b','#a855f7','#ef4444',
    '#14b8a6','#f97316','#6366f1','#ec4899','#0ea5e9',
    '#84cc16','#8b5cf6','#06b6d4','#d97706','#10b981',
    '#e11d48','#7c3aed','#0891b2','#65a30d','#dc2626',
    '#9333ea','#0284c7','#4d7c0f','#b91c1c','#7e22ce',
    '#0369a1',
  ];

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: { duration: 600, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        borderWidth: 1,
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        padding: 10,
        cornerRadius: 8,
      },
    },
  };

  // ── Formatta importo ────────────────────────────────────────────────────────
  function fmtCurrency(amount, currency) {
    try {
      return new Intl.NumberFormat('it-IT', {
        style: 'currency', currency: currency || 'EUR',
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${parseFloat(amount).toFixed(2)} ${currency || 'EUR'}`;
    }
  }

  // ── Grafico dividendi mensili ───────────────────────────────────────────────
  function initMonthlyChart(monthlyData, currency) {
    const ctx = document.getElementById('monthly-chart')?.getContext('2d');
    if (!ctx) return;

    // Prendi gli ultimi 18 mesi con dati disponibili
    const last18 = (monthlyData || []).slice(-18);

    const labels = last18.map(m => {
      const [y, mo] = m.month.split('-');
      return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('it-IT', {
        month: 'short', year: '2-digit',
      });
    });

    const divData    = last18.map(m => m.dividends    || 0);
    const realizedPL = last18.map(m => m.realized_pl  || 0);

    if (monthlyChart) monthlyChart.destroy();

    monthlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Dividendi',
            data: divData,
            backgroundColor: 'rgba(245,158,11,.75)',
            hoverBackgroundColor: 'rgba(245,158,11,.95)',
            borderRadius: 4,
            borderSkipped: false,
            stack: 'stack',
          },
          {
            label: 'P&L Realizzato',
            data: realizedPL,
            backgroundColor: realizedPL.map(v =>
              v >= 0 ? 'rgba(34,197,94,.65)' : 'rgba(239,68,68,.65)'
            ),
            hoverBackgroundColor: realizedPL.map(v =>
              v >= 0 ? 'rgba(34,197,94,.9)' : 'rgba(239,68,68,.9)'
            ),
            borderRadius: 4,
            borderSkipped: false,
            stack: 'stack2',
          },
        ],
      },
      options: {
        ...baseOptions,
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,.04)', drawBorder: false },
            ticks: { color: '#64748b', font: { size: 10 } },
          },
          y: {
            grid: { color: 'rgba(255,255,255,.06)', drawBorder: false },
            ticks: {
              color: '#64748b', font: { size: 10 },
              callback: v => fmtCurrency(v, currency),
            },
            border: { dash: [4, 4] },
          },
        },
        plugins: {
          ...baseOptions.plugins,
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: { color: '#94a3b8', boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 11 } },
          },
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${fmtCurrency(ctx.raw, currency)}`,
            },
          },
        },
      },
    });
  }

  // ── Grafico allocazione portafoglio ────────────────────────────────────────
  function initAllocationChart(positions, currency) {
    const ctx = document.getElementById('allocation-chart')?.getContext('2d');
    if (!ctx) return;

    if (!positions || positions.length === 0) {
      if (allocationChart) allocationChart.destroy();
      return;
    }

    // Ordina per valore corrente e prendi top 12, aggruppa il resto
    const sorted = [...positions]
      .sort((a, b) =>
        (b.walletImpact?.currentValue || 0) - (a.walletImpact?.currentValue || 0)
      );

    const TOP_N = 12;
    const top   = sorted.slice(0, TOP_N);
    const rest  = sorted.slice(TOP_N);
    const restTotal = rest.reduce((s, p) => s + (p.walletImpact?.currentValue || 0), 0);

    const labels = top.map(p =>
      (p.instrument?.name || p.ticker || '').substring(0, 22)
    );
    const values = top.map(p => p.walletImpact?.currentValue || 0);

    if (rest.length > 0) {
      labels.push(`Altri ${rest.length} titoli`);
      values.push(restTotal);
    }

    const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

    if (allocationChart) allocationChart.destroy();

    allocationChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors.map(c => c + 'cc'),  // ~80% opacity
          hoverBackgroundColor: colors,
          borderColor: '#020617',
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        ...baseOptions,
        cutout: '68%',
        plugins: {
          ...baseOptions.plugins,
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: '#e2e8f0',
              boxWidth: 10, boxHeight: 10,
              padding: 8, font: { size: 10 },
              generateLabels: chart => {
                const ds = chart.data.datasets[0];
                const total = ds.data.reduce((a, b) => a + b, 0);
                return chart.data.labels.map((label, i) => ({
                  text: `${label.substring(0, 18)} — ${((ds.data[i] / total) * 100).toFixed(1)}%`,
                  fillStyle: ds.backgroundColor[i],
                  strokeStyle: ds.borderColor,
                  lineWidth: 1,
                  index: i,
                  hidden: false,
                }));
              },
            },
          },
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: {
              label: ctx => {
                const val = ctx.raw;
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((val / total) * 100).toFixed(1);
                return ` ${fmtCurrency(val, currency)}  (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  // ── Update con nuovi dati ──────────────────────────────────────────────────
  function updateMonthly(monthlyData, currency) {
    initMonthlyChart(monthlyData, currency);
  }

  function updateAllocation(positions, currency) {
    initAllocationChart(positions, currency);
  }

  return { updateMonthly, updateAllocation };
})();
