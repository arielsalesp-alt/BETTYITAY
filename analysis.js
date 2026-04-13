const STORAGE_KEY = "family-expense-manager-2026";

const els = {
  range: document.querySelector("#analysisRange"),
  refresh: document.querySelector("#refreshAnalysisBtn"),
  summary: document.querySelector("#analysisSummary"),
  monthlyChart: document.querySelector("#monthlyChart"),
  categoryChart: document.querySelector("#categoryChart"),
  peopleChart: document.querySelector("#peopleChart"),
  topExpenses: document.querySelector("#topExpenses"),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadAnalysisState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const base = clone(window.EXPENSE_SEED_DATA);
  if (window.EXPENSE_ARCHIVE_DATA?.months) {
    const existing = new Set(base.months.map((month) => month.name));
    window.EXPENSE_ARCHIVE_DATA.months.forEach((month) => {
      if (!existing.has(month.name)) base.months.push(month);
    });
  }
  return base;
}

function money(value) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function sumItems(items, field) {
  return items.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
}

function getMonthStats(month) {
  const categories = month.categories.map((category) => {
    const betty = sumItems(category.items, "betty");
    const itai = sumItems(category.items, "itai");
    const cash = sumItems(category.items, "cash");
    return { key: category.key, name: category.name, betty, itai, cash, total: betty + itai + cash };
  });
  const betty = categories.reduce((sum, category) => sum + category.betty, 0);
  const itai = categories.reduce((sum, category) => sum + category.itai, 0);
  const cash = categories.reduce((sum, category) => sum + category.cash, 0);
  return { name: month.name, source: month.source || "", categories, betty, itai, cash, total: betty + itai + cash };
}

function filterMonths(months) {
  const range = els.range.value;
  if (range === "2026") return months.filter((month) => !month.source);
  if (range === "archive") return months.filter((month) => month.source);
  return months;
}

function buildAnalysis() {
  const state = loadAnalysisState();
  const months = filterMonths(state.months).map(getMonthStats).filter((month) => month.total > 0);
  const totals = months.reduce((sum, month) => sum + month.total, 0);
  const betty = months.reduce((sum, month) => sum + month.betty, 0);
  const itai = months.reduce((sum, month) => sum + month.itai, 0);
  const cash = months.reduce((sum, month) => sum + month.cash, 0);
  const average = months.length ? totals / months.length : 0;
  const biggestMonth = months.reduce((best, month) => (month.total > (best?.total || 0) ? month : best), null);

  const categories = new Map();
  const expenses = [];
  months.forEach((month) => {
    month.categories.forEach((category) => {
      categories.set(category.name, (categories.get(category.name) || 0) + category.total);
    });
  });

  filterMonths(state.months).forEach((month) => {
    month.categories.forEach((category) => {
      category.items.forEach((item) => {
        const total = (Number(item.betty) || 0) + (Number(item.itai) || 0) + (Number(item.cash) || 0);
        if (total <= 0) return;
        expenses.push({
          month: month.name,
          category: category.name,
          name: item.name,
          total,
          betty: Number(item.betty) || 0,
          itai: Number(item.itai) || 0,
          cash: Number(item.cash) || 0,
        });
      });
    });
  });

  const categoryRows = Array.from(categories.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
  const topExpenses = expenses.sort((a, b) => b.total - a.total).slice(0, 12);

  renderSummary({ totals, betty, itai, cash, average, biggestMonth, monthCount: months.length });
  drawBars(els.monthlyChart, months.slice(-18).map((month) => ({ label: month.name, value: month.total })), {
    color: "#138a72",
    horizontal: false,
  });
  drawBars(els.categoryChart, categoryRows.slice(0, 8).map((category) => ({ label: category.name, value: category.total })), {
    color: "#d85b4a",
    horizontal: true,
  });
  drawGroupedBars(els.peopleChart, months.slice(-12).map((month) => ({
    label: month.name,
    betty: month.betty,
    itai: month.itai,
    cash: month.cash,
  })));
  renderTopExpenses(topExpenses);
}

function renderSummary(data) {
  els.summary.innerHTML = `
    <article class="metric">
      <span>סה״כ הוצאות</span>
      <strong>${money(data.totals)}</strong>
    </article>
    <article class="metric">
      <span>ממוצע לחודש</span>
      <strong>${money(data.average)}</strong>
    </article>
    <article class="metric">
      <span>החודש הגבוה</span>
      <strong>${data.biggestMonth ? money(data.biggestMonth.total) : money(0)}</strong>
      <small>${data.biggestMonth?.name || "אין נתונים"}</small>
    </article>
    <article class="metric highlight">
      <span>בטי / איתי / מזומן</span>
      <strong>${money(data.betty)} / ${money(data.itai)} / ${money(data.cash)}</strong>
      <small>${data.monthCount} חודשים בניתוח</small>
    </article>
  `;
}

function renderTopExpenses(rows) {
  const body = rows.length
    ? rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.month)}</td>
          <td>${escapeHtml(row.category)}</td>
          <td>${money(row.total)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="4">אין נתונים להצגה</td></tr>`;

  els.topExpenses.innerHTML = `
    <table class="debt-table">
      <thead>
        <tr>
          <th>הוצאה</th>
          <th>חודש</th>
          <th>קטגוריה</th>
          <th>סכום</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function resizeCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Number(canvas.getAttribute("height")) || 280;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

function drawBars(canvas, rows, options) {
  const { ctx, width, height } = resizeCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  drawEmptyState(ctx, rows, width, height);
  if (!rows.length) return;

  const max = Math.max(...rows.map((row) => row.value), 1);
  ctx.font = "13px Arial";
  ctx.fillStyle = "#65706d";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  if (options.horizontal) {
    const gap = 10;
    const barHeight = Math.max(18, (height - 34 - gap * (rows.length - 1)) / rows.length);
    rows.forEach((row, index) => {
      const y = 18 + index * (barHeight + gap);
      const labelWidth = Math.min(150, width * 0.36);
      const barWidth = ((width - labelWidth - 28) * row.value) / max;
      ctx.fillStyle = "#65706d";
      ctx.fillText(shortLabel(row.label, 18), width - 8, y + barHeight / 2);
      ctx.fillStyle = options.color;
      ctx.fillRect(16, y, barWidth, barHeight);
      ctx.fillStyle = "#17211f";
      ctx.textAlign = "left";
      ctx.fillText(money(row.value), 18 + barWidth, y + barHeight / 2);
      ctx.textAlign = "right";
    });
    return;
  }

  const plotTop = 24;
  const plotBottom = height - 48;
  const barGap = 8;
  const barWidth = Math.max(12, (width - 28 - barGap * (rows.length - 1)) / rows.length);
  rows.forEach((row, index) => {
    const x = 14 + index * (barWidth + barGap);
    const barHeight = ((plotBottom - plotTop) * row.value) / max;
    const y = plotBottom - barHeight;
    ctx.fillStyle = options.color;
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#65706d";
    ctx.save();
    ctx.translate(x + barWidth / 2, height - 8);
    ctx.rotate(-Math.PI / 5);
    ctx.textAlign = "right";
    ctx.fillText(shortLabel(row.label, 10), 0, 0);
    ctx.restore();
  });
}

function drawGroupedBars(canvas, rows) {
  const { ctx, width, height } = resizeCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  drawEmptyState(ctx, rows, width, height);
  if (!rows.length) return;

  const max = Math.max(...rows.flatMap((row) => [row.betty, row.itai, row.cash]), 1);
  const colors = { betty: "#138a72", itai: "#d85b4a", cash: "#f3c64e" };
  const plotBottom = height - 52;
  const plotTop = 28;
  const groupWidth = (width - 28) / rows.length;
  const barWidth = Math.max(6, Math.min(18, groupWidth / 5));
  rows.forEach((row, index) => {
    const groupX = 14 + index * groupWidth + groupWidth / 2;
    ["betty", "itai", "cash"].forEach((field, fieldIndex) => {
      const value = row[field];
      const barHeight = ((plotBottom - plotTop) * value) / max;
      const x = groupX + (fieldIndex - 1) * (barWidth + 3);
      ctx.fillStyle = colors[field];
      ctx.fillRect(x, plotBottom - barHeight, barWidth, barHeight);
    });
    ctx.fillStyle = "#65706d";
    ctx.font = "12px Arial";
    ctx.save();
    ctx.translate(groupX, height - 10);
    ctx.rotate(-Math.PI / 5);
    ctx.textAlign = "right";
    ctx.fillText(shortLabel(row.label, 9), 0, 0);
    ctx.restore();
  });
  drawLegend(ctx, width);
}

function drawLegend(ctx, width) {
  const items = [
    ["בטי", "#138a72"],
    ["איתי", "#d85b4a"],
    ["מזומן", "#f3c64e"],
  ];
  let x = width - 12;
  ctx.font = "13px Arial";
  ctx.textAlign = "right";
  items.forEach(([label, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(x - 12, 8, 10, 10);
    ctx.fillStyle = "#17211f";
    ctx.fillText(label, x - 18, 13);
    x -= 82;
  });
}

function drawEmptyState(ctx, rows, width, height) {
  if (rows.length) return;
  ctx.fillStyle = "#65706d";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("אין נתונים להצגה", width / 2, height / 2);
}

function shortLabel(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

els.refresh.addEventListener("click", buildAnalysis);
els.range.addEventListener("change", buildAnalysis);
window.addEventListener("resize", buildAnalysis);
buildAnalysis();
