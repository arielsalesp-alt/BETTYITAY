const STORAGE_KEY = "family-expense-manager-2026";

const els = {
  range: document.querySelector("#analysisRange"),
  period: document.querySelector("#analysisPeriod"),
  year: document.querySelector("#analysisYear"),
  month: document.querySelector("#analysisMonth"),
  refresh: document.querySelector("#refreshAnalysisBtn"),
  summary: document.querySelector("#analysisSummary"),
  periodChartTitle: document.querySelector("#periodChartTitle"),
  monthlyChart: document.querySelector("#monthlyChart"),
  categoryChart: document.querySelector("#categoryChart"),
  peopleChart: document.querySelector("#peopleChart"),
  topExpenses: document.querySelector("#topExpenses"),
  detailTitle: document.querySelector("#detailTitle"),
  detailTables: document.querySelector("#detailTables"),
};

const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadAnalysisState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return mergeArchiveMonths(JSON.parse(saved));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return mergeArchiveMonths(clone(window.EXPENSE_SEED_DATA));
}

function mergeArchiveMonths(base) {
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

function getMonthYear(month, index) {
  const text = String(month.name || "");
  const directYear = text.match(/(?:^|\D)(2[1-6])(?:\D|$)/);
  if (directYear) return `20${directYear[1]}`;
  if (!month.source) return "2026";
  if (/חודש\s*(7|8|9|10|11|12)$/.test(text)) return "2021";
  if (/ינואר|פברואר/.test(text)) return "2022";
  if (index < 6) return "2021";
  if (index < 8) return "2022";
  return "ללא שנה";
}

function getMonthNumber(month, index) {
  const text = String(month.name || "").replace(/\s+/g, " ");
  const explicitNumber = text.match(/חודש\s*(\d{1,2})/);
  if (explicitNumber) return Math.min(Number(explicitNumber[1]), 12);

  const normalized = text.replace("אפירל", "אפריל");
  const foundIndex = HEBREW_MONTHS.findIndex((name) => normalized.includes(name));
  if (foundIndex >= 0) return foundIndex + 1;

  return ((index % 12) + 1);
}

function getPeriodLabel(month, index) {
  const year = getMonthYear(month, index);
  const monthNumber = getMonthNumber(month, index);
  const monthName = HEBREW_MONTHS[monthNumber - 1] || month.name;
  return els.period.value === "yearly" ? year : `${monthName} ${year}`;
}

function filterMonths(months) {
  const range = els.range.value;
  if (range === "2026") return months.filter((month) => !month.source);
  if (range === "archive") return months.filter((month) => month.source);
  return months;
}

function buildAnalysis() {
  const state = loadAnalysisState();
  const periodMode = els.period.value;
  const rawMonths = filterMonths(state.months);
  const allMonths = rawMonths.map((month, index) => ({
    ...getMonthStats(month),
    period: getPeriodLabel(month, index),
    year: getMonthYear(month, index),
    monthNumber: getMonthNumber(month, index),
    monthLabel: HEBREW_MONTHS[getMonthNumber(month, index) - 1] || month.name,
    original: month,
  })).filter((month) => month.total > 0);
  syncFilterOptions(allMonths);
  const months = filterBySelectedYearAndMonth(allMonths);
  const periodRows = groupMonthsByPeriod(months);
  const totals = periodRows.reduce((sum, period) => sum + period.total, 0);
  const betty = periodRows.reduce((sum, period) => sum + period.betty, 0);
  const itai = periodRows.reduce((sum, period) => sum + period.itai, 0);
  const cash = periodRows.reduce((sum, period) => sum + period.cash, 0);
  const average = periodRows.length ? totals / periodRows.length : 0;
  const biggestPeriod = periodRows.reduce((best, period) => (period.total > (best?.total || 0) ? period : best), null);

  const categories = new Map();
  const expenses = [];
  months.forEach((month) => {
    month.categories.forEach((category) => {
      categories.set(category.name, (categories.get(category.name) || 0) + category.total);
    });
  });

  months.forEach((month) => {
    month.original.categories.forEach((category) => {
      category.items.forEach((item) => {
        const total = (Number(item.betty) || 0) + (Number(item.itai) || 0) + (Number(item.cash) || 0);
        if (total <= 0) return;
        expenses.push({
          month: month.period,
          year: month.year,
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

  els.periodChartTitle.textContent = periodMode === "yearly" ? "סה״כ הוצאות לפי שנה" : "סה״כ הוצאות לפי חודש";
  renderSummary({
    totals,
    betty,
    itai,
    cash,
    average,
    biggestPeriod,
    periodCount: periodRows.length,
    periodLabel: periodMode === "yearly" ? "שנים" : "חודשים",
  });
  drawBars(els.monthlyChart, periodRows.slice(periodMode === "yearly" ? -8 : -18).map((period) => ({ label: period.label, value: period.total })), {
    color: "#138a72",
    horizontal: false,
  });
  drawBars(els.categoryChart, categoryRows.slice(0, 8).map((category) => ({ label: category.name, value: category.total })), {
    color: "#d85b4a",
    horizontal: true,
  });
  drawGroupedBars(els.peopleChart, periodRows.slice(periodMode === "yearly" ? -8 : -12).map((period) => ({
    label: period.label,
    betty: period.betty,
    itai: period.itai,
    cash: period.cash,
  })));
  renderTopExpenses(topExpenses);
  renderDetailTables({ periodRows, categoryRows, expenses, months });
}

function syncFilterOptions(months) {
  const selectedYear = els.year.value || "all";
  const selectedMonth = els.month.value || "all";
  const years = unique(months.map((month) => month.year)).sort();
  els.year.innerHTML = [`<option value="all">כל השנים</option>`]
    .concat(years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`))
    .join("");
  els.year.value = years.includes(selectedYear) ? selectedYear : "all";

  const monthSource = els.year.value === "all" ? months : months.filter((month) => month.year === els.year.value);
  const monthNumbers = unique(monthSource.map((month) => month.monthNumber)).sort((a, b) => a - b);
  els.month.innerHTML = [`<option value="all">כל החודשים</option>`]
    .concat(monthNumbers.map((monthNumber) => `<option value="${monthNumber}">${HEBREW_MONTHS[monthNumber - 1]}</option>`))
    .join("");
  els.month.value = monthNumbers.includes(Number(selectedMonth)) ? selectedMonth : "all";
}

function filterBySelectedYearAndMonth(months) {
  return months.filter((month) => {
    const yearMatch = els.year.value === "all" || month.year === els.year.value;
    const monthMatch = els.month.value === "all" || month.monthNumber === Number(els.month.value);
    return yearMatch && monthMatch;
  });
}

function unique(values) {
  return Array.from(new Set(values.filter((value) => value !== "" && value != null)));
}

function groupMonthsByPeriod(months) {
  const groups = new Map();
  months.forEach((month) => {
    const key = els.period.value === "yearly" ? month.year : month.period;
    if (!groups.has(key)) {
      groups.set(key, { label: key, betty: 0, itai: 0, cash: 0, total: 0 });
    }
    const group = groups.get(key);
    group.betty += month.betty;
    group.itai += month.itai;
    group.cash += month.cash;
    group.total += month.total;
  });
  return Array.from(groups.values());
}

function renderSummary(data) {
  els.summary.innerHTML = `
    <article class="metric">
      <span>סה״כ הוצאות</span>
      <strong>${money(data.totals)}</strong>
    </article>
    <article class="metric">
      <span>ממוצע ל${data.periodLabel === "שנים" ? "שנה" : "חודש"}</span>
      <strong>${money(data.average)}</strong>
    </article>
    <article class="metric">
      <span>התקופה הגבוהה</span>
      <strong>${data.biggestPeriod ? money(data.biggestPeriod.total) : money(0)}</strong>
      <small>${data.biggestPeriod?.label || "אין נתונים"}</small>
    </article>
    <article class="metric highlight">
      <span>בטי / איתי / מזומן</span>
      <strong>${money(data.betty)} / ${money(data.itai)} / ${money(data.cash)}</strong>
      <small>${data.periodCount} ${data.periodLabel} בניתוח</small>
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

function renderDetailTables(data) {
  const titleParts = [];
  if (els.year.value !== "all") titleParts.push(els.year.value);
  if (els.month.value !== "all") titleParts.push(HEBREW_MONTHS[Number(els.month.value) - 1]);
  els.detailTitle.textContent = titleParts.length ? `נתונים מדויקים - ${titleParts.join(" / ")}` : "נתונים מדויקים - כל התקופה";

  const periodBody = data.periodRows.length
    ? data.periodRows.map((row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td>${money(row.betty)}</td>
          <td>${money(row.itai)}</td>
          <td>${money(row.cash)}</td>
          <td>${money(row.total)}</td>
          <td>${money(Math.abs(row.betty - row.itai))}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="6">אין נתונים לתקופה שנבחרה</td></tr>`;

  const categoryBody = data.categoryRows.length
    ? data.categoryRows.map((row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${money(row.total)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="2">אין קטגוריות לתקופה שנבחרה</td></tr>`;

  const expenseBody = data.expenses.length
    ? data.expenses.map((row) => `
        <tr>
          <td>${escapeHtml(row.month)}</td>
          <td>${escapeHtml(row.category)}</td>
          <td>${escapeHtml(row.name)}</td>
          <td>${money(row.betty)}</td>
          <td>${money(row.itai)}</td>
          <td>${money(row.cash)}</td>
          <td>${money(row.total)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="7">אין הוצאות לתקופה שנבחרה</td></tr>`;

  els.detailTables.innerHTML = `
    <table class="debt-table">
      <thead>
        <tr>
          <th>תקופה</th>
          <th>בטי</th>
          <th>איתי</th>
          <th>מזומן</th>
          <th>סה״כ</th>
          <th>פער בטי/איתי</th>
        </tr>
      </thead>
      <tbody>${periodBody}</tbody>
    </table>
    <table class="debt-table">
      <thead>
        <tr>
          <th>קטגוריה</th>
          <th>סה״כ</th>
        </tr>
      </thead>
      <tbody>${categoryBody}</tbody>
    </table>
    <table class="debt-table">
      <thead>
        <tr>
          <th>חודש</th>
          <th>קטגוריה</th>
          <th>הוצאה</th>
          <th>בטי</th>
          <th>איתי</th>
          <th>מזומן</th>
          <th>סה״כ</th>
        </tr>
      </thead>
      <tbody>${expenseBody}</tbody>
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
els.period.addEventListener("change", buildAnalysis);
els.year.addEventListener("change", buildAnalysis);
els.month.addEventListener("change", buildAnalysis);
window.addEventListener("resize", buildAnalysis);
buildAnalysis();
