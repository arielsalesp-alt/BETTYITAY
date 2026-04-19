const STORAGE_KEY = "family-expense-manager-2026";
const CLOUD_CONFIG_KEY = "family-expense-manager-cloud-config";

const els = {
  monthSelect: document.querySelector("#monthSelect"),
  categorySelect: document.querySelector("#categorySelect"),
  summary: document.querySelector("#summary"),
  categories: document.querySelector("#categories"),
  entryForm: document.querySelector("#entryForm"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  cloudEndpointInput: document.querySelector("#cloudEndpointInput"),
  cloudTokenInput: document.querySelector("#cloudTokenInput"),
  saveCloudSettingsBtn: document.querySelector("#saveCloudSettingsBtn"),
  loadCloudBtn: document.querySelector("#loadCloudBtn"),
  saveCloudBtn: document.querySelector("#saveCloudBtn"),
  cloudStatus: document.querySelector("#cloudStatus"),
  closeMonthBtn: document.querySelector("#closeMonthBtn"),
  addMonthBtn: document.querySelector("#addMonthBtn"),
  openDebtsBtn: document.querySelector("#openDebtsBtn"),
  closeDebtsBtn: document.querySelector("#closeDebtsBtn"),
  toggleMonthClosuresInTotalBtn: document.querySelector("#toggleMonthClosuresInTotalBtn"),
  debtPanel: document.querySelector("#debtPanel"),
  debts: document.querySelector("#debts"),
};

const HEBREW_MONTHS_2026 = [
  "ינואר 26",
  "פברואר 26",
  "מרץ 26",
  "אפריל 26",
  "מאי 26",
  "יוני 26",
  "יולי 26",
  "אוגוסט 26",
  "ספטמבר 26",
  "אוקטובר 26",
  "נובמבר 26",
  "דצמבר 26",
];

let state = loadState();
state = migrateState(state);
saveState();
let selectedMonth = 0;
let cloudSaveTimer = null;
let cloudReady = false;
let cloudJsonpCounter = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return clone(window.EXPENSE_SEED_DATA);
}

function migrateState(nextState) {
  const migrated = clone(nextState);
  const archive = window.EXPENSE_ARCHIVE_DATA;
  if (!archive) return migrated;
  let currentClosures = migrated.debts?.monthClosures || [];
  if (migrated.debts?.closureConvention !== "positive-itai-owes-betty") {
    currentClosures = currentClosures.map((closure) => ({
      ...closure,
      delta: -(Number(closure.delta) || 0),
      payer: closure.receiver || closure.payer,
      receiver: closure.payer || closure.receiver,
    }));
  }

  const existingMonths = new Set(migrated.months.map((month) => month.name));
  archive.months.forEach((month) => {
    if (!existingMonths.has(month.name)) {
      migrated.months.push(month);
    }
  });

  if (archive.debts) {
    migrated.debts = clone(archive.debts);
    migrated.debts.monthClosures = currentClosures;
    migrated.debts.closureConvention = "positive-itai-owes-betty";
  }
  ensureDebtStructures(migrated);
  moveMovingCashToShopping(migrated);
  updateRentNamesFromMarch2026(migrated);
  markProtectedExcelRows(migrated);

  return migrated;
}

function updateRentNamesFromMarch2026(nextState) {
  nextState.months.forEach((month) => {
    const order = getMonthIndex2026(month.name);
    if (order < 2) return;
    month.categories.forEach((category) => {
      category.items.forEach((item) => {
        const name = String(item.name || "").replace(/\s+/g, " ").trim();
        if (name === "שכירות כפר שמואל") {
          item.name = "שכירות לוד";
        }
      });
    });
  });
}

function moveMovingCashToShopping(nextState) {
  const movingItems = nextState.movingCash?.spent?.map((item, index) => ({
    name: item.name,
    amount: Number(item.amount) || 0,
    sourceId: `moving-cash-spent-${index}`,
  })) || collectExistingMovingRows(nextState);
  if (!movingItems.length) return;
  const targetMonth = nextState.months.find((month) => month.name === "פברואר 26") || nextState.months[0];
  cleanupMovingCashRows(nextState, targetMonth?.name);
  const shopping = targetMonth?.categories.find((category) => category.key === "shopping");
  if (!shopping) return;

  const existing = new Set(shopping.items.map((item) => item.sourceId));
  movingItems.forEach((item) => {
    if (existing.has(item.sourceId)) return;
    shopping.items.push({
      name: `מעבר דירה - ${item.name}`,
      betty: 0,
      itai: 0,
      cash: Number(item.amount) || 0,
      sourceId: item.sourceId,
      protected: true,
    });
  });
  delete nextState.movingCash;
}

function collectExistingMovingRows(nextState) {
  const rows = [];
  nextState.months.forEach((month) => {
    month.categories.forEach((category) => {
      category.items.forEach((item, index) => {
        const isMoving = item.sourceId?.startsWith("moving-cash-spent-") || String(item.name || "").startsWith("מעבר דירה - ");
        if (!isMoving) return;
        rows.push({
          name: String(item.name || "").replace(/^מעבר דירה - /, ""),
          amount: Number(item.cash || item.betty || item.itai) || 0,
          sourceId: item.sourceId || `moving-cash-spent-existing-${month.name}-${category.key}-${index}`,
        });
      });
    });
  });
  return rows;
}

function cleanupMovingCashRows(nextState, keepMonthName) {
  nextState.months.forEach((month) => {
    month.categories.forEach((category) => {
      category.items = category.items.filter((item) => {
        const isMoving = item.sourceId?.startsWith("moving-cash-spent-") || String(item.name || "").startsWith("מעבר דירה - ");
        return !isMoving || month.name === keepMonthName;
      });
    });
  });
}

function markProtectedExcelRows(nextState) {
  nextState.months.forEach((month) => {
    month.categories.forEach((category) => {
      category.items.forEach((item) => {
        if (!item.manual) item.protected = true;
      });
    });
  });
}

function ensureDebtStructures(nextState) {
  if (!nextState.debts) {
    nextState.debts = { name: "חובות", bankruptcy: [], years: [], monthClosures: [] };
  }
  nextState.debts.bankruptcy ||= [];
  nextState.debts.years ||= [];
  nextState.debts.monthClosures ||= [];
  nextState.debts.includeMonthClosuresInTotal ??= true;
  nextState.debts.closureConvention = "positive-itai-owes-betty";
  nextState.debts.years.sort((a, b) => a.year - b.year);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persistState() {
  saveState();
  scheduleCloudSave();
}

function loadCloudConfig() {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY)) || { endpoint: "", token: "" };
  } catch {
    localStorage.removeItem(CLOUD_CONFIG_KEY);
    return { endpoint: "", token: "" };
  }
}

function saveCloudConfig(config) {
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
}

function getCloudConfigFromInputs() {
  return {
    endpoint: els.cloudEndpointInput.value.trim(),
    token: els.cloudTokenInput.value.trim(),
  };
}

function setCloudStatus(message, isError = false) {
  if (!els.cloudStatus) return;
  els.cloudStatus.textContent = message;
  els.cloudStatus.classList.toggle("cloud-error", isError);
}

function hasCloudConfig(config = loadCloudConfig()) {
  return Boolean(config.endpoint && config.token);
}

function initCloudSync() {
  const config = loadCloudConfig();
  els.cloudEndpointInput.value = config.endpoint || "";
  els.cloudTokenInput.value = config.token || "";
  cloudReady = true;
  if (!hasCloudConfig(config)) {
    setCloudStatus("עדיין לא הוגדר חיבור. הנתונים נשמרים במכשיר הזה בלבד.");
    return;
  }
  setCloudStatus("מחובר ל-Google Sheets. הנתונים יישמרו גם בענן.");
  loadCloudState({ silent: true });
}

function scheduleCloudSave() {
  if (!cloudReady || !hasCloudConfig()) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(() => saveCloudState({ silent: true }), 900);
}

function buildCloudUrl(config, params) {
  const url = new URL(config.endpoint);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function requestCloudLoad() {
  const config = loadCloudConfig();
  if (!hasCloudConfig(config)) {
    return Promise.reject(new Error("לא הוגדר חיבור Google Sheets."));
  }

  return new Promise((resolve, reject) => {
    const callbackName = `bettyItayCloudCallback${Date.now()}${cloudJsonpCounter++}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("לא התקבלה תשובה מ-Google Sheets."));
    }, 20000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (result) => {
      cleanup();
      if (!result || !result.ok) {
        reject(new Error(result?.error || "שגיאה בטעינה מ-Google Sheets."));
        return;
      }
      resolve(result);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("הדפדפן לא הצליח לטעון את Google Sheets."));
    };

    script.src = buildCloudUrl(config, {
      action: "load",
      token: config.token,
      callback: callbackName,
      t: Date.now().toString(),
    });
    document.body.appendChild(script);
  });
}

function requestCloudSave(data) {
  const config = loadCloudConfig();
  if (!hasCloudConfig(config)) {
    return Promise.reject(new Error("לא הוגדר חיבור Google Sheets."));
  }

  return new Promise((resolve, reject) => {
    const iframeName = `cloudSaveFrame${Date.now()}${cloudJsonpCounter++}`;
    const iframe = document.createElement("iframe");
    const form = document.createElement("form");
    let submitted = false;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheets לא אישר את השמירה בזמן."));
    }, 25000);

    function cleanup() {
      window.clearTimeout(timeout);
      form.remove();
      iframe.remove();
    }

    function addField(name, value) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }

    iframe.name = iframeName;
    iframe.style.display = "none";
    iframe.onload = () => {
      if (!submitted) return;
      cleanup();
      resolve({ ok: true, updatedAt: new Date().toISOString() });
    };

    form.method = "POST";
    form.action = config.endpoint;
    form.target = iframeName;
    form.style.display = "none";
    addField("action", "save");
    addField("token", config.token);
    addField("savedAt", new Date().toISOString());
    addField("data", JSON.stringify(data));

    document.body.appendChild(iframe);
    document.body.appendChild(form);
    submitted = true;
    form.submit();
  });
}

async function loadCloudState(options = {}) {
  try {
    const result = await requestCloudLoad();
    if (result.data?.months) {
      state = migrateState(result.data);
      selectedMonth = Math.min(selectedMonth, state.months.length - 1);
      saveState();
      renderSelectors();
      render();
      setCloudStatus(`נטען מהענן: ${formatCloudTime(result.updatedAt)}`);
    } else if (!options.silent) {
      setCloudStatus("אין עדיין נתונים בענן. אפשר ללחוץ שמור עכשיו בענן.");
    }
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

async function saveCloudState(options = {}) {
  try {
    await requestCloudSave(state);
    if (!options.silent) {
      setCloudStatus("נשמר בענן בהצלחה.");
    } else {
      setCloudStatus("נשמר אוטומטית בענן.");
    }
  } catch (error) {
    setCloudStatus(`נשמר במכשיר בלבד. ${error.message}`, true);
  }
}

function formatCloudTime(value) {
  if (!value) return "אין תאריך שמירה";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function money(value) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function sumItems(items, person) {
  return items.reduce((sum, item) => sum + (Number(item[person]) || 0), 0);
}

function getMonth() {
  return state.months[selectedMonth];
}

function getMonthIndex2026(name) {
  return HEBREW_MONTHS_2026.indexOf(name);
}

function getLatest2026Month() {
  return state.months
    .map((month, index) => ({ month, index, order: getMonthIndex2026(month.name) }))
    .filter((item) => item.order >= 0)
    .sort((a, b) => b.order - a.order)[0];
}

function buildNextMonthFromTemplate(template, nextName) {
  const nextOrder = getMonthIndex2026(nextName);
  return {
    name: nextName,
    income: { itai: 0, betty: 0 },
    categories: template.month.categories.map((category) => ({
      key: category.key,
      name: category.name,
      items: category.items
        .filter((item) => !item.sourceId?.startsWith("moving-cash-spent-"))
        .map((item) => ({
          name: getNextMonthItemName(item.name, nextOrder),
          betty: category.key === "home" ? Number(item.betty) || 0 : 0,
          itai: category.key === "home" ? Number(item.itai) || 0 : 0,
          protected: true,
        })),
    })),
  };
}

function getNextMonthItemName(name, monthOrder) {
  const normalized = String(name || "").replace(/\s+/g, " ").trim();
  if (monthOrder >= 2 && normalized === "שכירות כפר שמואל") {
    return "שכירות לוד";
  }
  return name;
}

function addNextMonth() {
  const latest = getLatest2026Month();
  if (!latest) {
    window.alert("לא מצאתי חודש 2026 קיים שאפשר לבנות ממנו חודש המשך.");
    return;
  }
  const nextOrder = latest.order + 1;
  if (!HEBREW_MONTHS_2026[nextOrder]) {
    window.alert("כל חודשי 2026 כבר קיימים במערכת.");
    return;
  }
  const nextName = HEBREW_MONTHS_2026[nextOrder];
  if (state.months.some((month) => month.name === nextName)) {
    window.alert(`${nextName} כבר קיים.`);
    return;
  }

  const nextMonth = buildNextMonthFromTemplate(latest, nextName);
  state.months.splice(latest.index + 1, 0, nextMonth);
  selectedMonth = latest.index + 1;
  persistState();
  renderSelectors();
  render();
}

function getMonthStats(month) {
  const categoryStats = month.categories.map((category) => {
    const betty = sumItems(category.items, "betty");
    const itai = sumItems(category.items, "itai");
    const cash = sumItems(category.items, "cash");
    return {
      ...category,
      betty,
      itai,
      cash,
      hasCash: category.items.some((item) => Object.prototype.hasOwnProperty.call(item, "cash")),
      total: betty + itai + cash,
      bettyVsHalf: betty - ((betty + itai) / 2),
    };
  });

  const betty = categoryStats.reduce((sum, category) => sum + category.betty, 0);
  const itai = categoryStats.reduce((sum, category) => sum + category.itai, 0);
  const cash = categoryStats.reduce((sum, category) => sum + category.cash, 0);
  const total = betty + itai + cash;
  const gap = Math.abs(betty - itai);
  const equalTransfer = gap / 2;
  const payer = betty < itai ? "בטי" : "איתי";
  const receiver = betty < itai ? "איתי" : "בטי";
  const debtDelta = betty - itai;

  return { categoryStats, betty, itai, cash, total, gap, equalTransfer, payer, receiver, debtDelta };
}

function renderSelectors() {
  els.monthSelect.innerHTML = state.months
    .map((month, index) => `<option value="${index}">${month.source ? month.source + " - " : ""}${month.name}</option>`)
    .join("");
  els.monthSelect.value = String(selectedMonth);
  renderCategorySelect();
}

function renderCategorySelect() {
  const month = getMonth();
  els.categorySelect.innerHTML = month.categories
    .map((category, index) => `<option value="${index}">${category.name}</option>`)
    .join("");
}

function renderSummary(stats) {
  const transferText = stats.gap === 0
    ? "אין פער"
    : `${stats.payer} חייב/ת ל${stats.receiver}`;

  els.summary.innerHTML = `
    <article class="metric">
      <span>סה"כ חודשי</span>
      <strong>${money(stats.total)}</strong>
    </article>
    <article class="metric">
      <span>בטי שילמה</span>
      <strong>${money(stats.betty)}</strong>
    </article>
    <article class="metric">
      <span>איתי שילם</span>
      <strong>${money(stats.itai)}</strong>
    </article>
    <article class="metric highlight">
      <span>${transferText}</span>
      <strong>${money(stats.gap)}</strong>
      <small>איזון חצי-חצי: ${money(stats.equalTransfer)}</small>
    </article>
  `;
}

function renderCategories(stats) {
  els.categories.innerHTML = stats.categoryStats.map((category, categoryIndex) => `
    <article class="category-card">
      <div class="category-head">
        <div>
          <h3>${category.name}</h3>
          <small>בטי: ${money(category.betty)} | איתי: ${money(category.itai)}</small>
        </div>
        <div class="category-total">${money(category.total)}</div>
      </div>
      <table class="expense-table">
        <thead>
          <tr>
            <th>הוצאה</th>
            <th>בטי</th>
            <th>איתי</th>
            ${category.hasCash ? `<th>מזומן</th>` : ""}
            <th>מחיקה</th>
          </tr>
        </thead>
        <tbody>
          ${category.items.map((item, itemIndex) => `
            <tr>
              <td data-label="הוצאה"><input class="name-input" data-category="${categoryIndex}" data-item="${itemIndex}" data-field="name" value="${escapeHtml(item.name)}"></td>
              <td data-label="בטי"><input type="number" inputmode="decimal" step="0.01" data-category="${categoryIndex}" data-item="${itemIndex}" data-field="betty" value="${item.betty}"></td>
              <td data-label="איתי"><input type="number" inputmode="decimal" step="0.01" data-category="${categoryIndex}" data-item="${itemIndex}" data-field="itai" value="${item.itai}"></td>
              ${category.hasCash ? `<td data-label="מזומן"><input type="number" inputmode="decimal" step="0.01" data-category="${categoryIndex}" data-item="${itemIndex}" data-field="cash" value="${item.cash || 0}"></td>` : ""}
              <td data-label="מחיקה">${item.protected ? `<span class="locked-row">נתוני אקסל</span>` : `<button class="mini-button" type="button" data-delete-category="${categoryIndex}" data-delete-item="${itemIndex}">מחיקה</button>`}</td>
            </tr>
          `).join("") || `<tr><td colspan="${category.hasCash ? 5 : 4}">אין עדיין הוצאות בקטגוריה הזו.</td></tr>`}
        </tbody>
      </table>
    </article>
  `).join("");
}

function renderDebts() {
  if (!els.debts || !state.debts) return;
  const bankruptcyRows = getBankruptcyRows();
  const bankruptcyTotal = bankruptcyRows.reduce((sum, item) => sum + item.amount, 0);
  const monthlyBalance = getMonthlyDebtBalance();
  const yearsBalance = state.debts.years.reduce(
    (sum, year) => sum + getYearDebtRows(year).reduce((yearSum, item) => yearSum + item.amount, 0),
    0,
  );
  const totalDebtBalance = bankruptcyTotal + yearsBalance + (state.debts.includeMonthClosuresInTotal ? monthlyBalance : 0);
  els.toggleMonthClosuresInTotalBtn.textContent = state.debts.includeMonthClosuresInTotal
    ? "הסר סגירות חודש מהסה״כ"
    : "הוסף סגירות חודש לסה״כ";

  const monthlyDebt = `
    <div class="debt-list debt-focus">
      <h3>סגירת חודשים 2026 - ${money(Math.abs(monthlyBalance))}</h3>
      ${renderDebtTable(
        [{ month: "יתרה מצטברת", party: getMonthlyDebtText(monthlyBalance), amount: Math.abs(monthlyBalance) }]
          .concat(state.debts.monthClosures.map((item) => ({
            month: item.monthName,
            party: getDebtPartyText(item.delta),
            amount: Math.abs(item.delta),
          }))),
      )}
    </div>
  `;
  const bankruptcy = `
    <div class="debt-list">
      <h3>חובות עבר - פשיטת רגל - איתי חייב לבטי ${money(bankruptcyTotal)}</h3>
      ${renderDebtTable(bankruptcyRows.map((item) => ({
        month: item.name,
        party: "איתי חייב לבטי",
        amount: Math.abs(Number(item.amount) || 0),
      })))}
    </div>
  `;

  const years = state.debts.years.map((year) => {
    const yearRows = getYearDebtRows(year);
    const total = yearRows.reduce((sum, item) => sum + item.amount, 0);
    return `
      <div class="debt-list">
        <h3>${year.year} - ${formatDebtStatus(total)}</h3>
        ${renderDebtTable(yearRows.map((item) => ({
          month: formatMonth(item.month),
          party: getDebtPartyText(item.amount),
          amount: Math.abs(Number(item.amount) || 0),
        })))}
      </div>
    `;
  }).join("");

  const totals = `
    <div class="debt-list debt-total">
      <h3>סה״כ חובות - ${formatDebtStatus(totalDebtBalance)}</h3>
      ${renderDebtTable([
        { month: "פשיטת רגל", party: "איתי חייב לבטי", amount: Math.abs(bankruptcyTotal) },
        { month: "חובות 22-25", party: getDebtPartyText(yearsBalance), amount: Math.abs(yearsBalance) },
        {
          month: "סגירות חודשים 2026",
          party: state.debts.includeMonthClosuresInTotal ? getDebtPartyText(monthlyBalance) : "לא כלול בסה״כ",
          amount: state.debts.includeMonthClosuresInTotal ? Math.abs(monthlyBalance) : 0,
        },
        { month: "סה״כ נטו", party: getDebtPartyText(totalDebtBalance), amount: Math.abs(totalDebtBalance) },
      ])}
    </div>
  `;

  els.debts.innerHTML = monthlyDebt + bankruptcy + years + totals;
}

function getBankruptcyRows() {
  return state.debts.bankruptcy.filter((item) => !String(item.name || "").includes("סה"));
}

function getYearDebtRows(year) {
  return year.entries.filter((item) => {
    const month = String(item.month || "").toLowerCase();
    return !month.includes("סה") && !month.includes("ñä");
  });
}

function renderDebtTable(rows) {
  const body = rows.length
    ? rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.month)}</td>
          <td>${escapeHtml(row.party)}</td>
          <td>${money(row.amount)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="3">אין חוב</td></tr>`;

  return `
    <table class="debt-table">
      <thead>
        <tr>
          <th>חודש</th>
          <th>מי חייב למי</th>
          <th>סכום</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function formatDebtStatus(amount) {
  const value = Number(amount) || 0;
  if (value > 0) return `איתי חייב לבטי ${money(value)}`;
  if (value < 0) return `בטי חייבת לאיתי ${money(Math.abs(value))}`;
  return "אין חוב";
}

function getDebtPartyText(amount) {
  const value = Number(amount) || 0;
  if (value > 0) return "איתי חייב לבטי";
  if (value < 0) return "בטי חייבת לאיתי";
  return "אין חוב";
}

function getMonthlyDebtBalance() {
  ensureDebtStructures(state);
  return state.debts.monthClosures.reduce((sum, item) => sum + item.delta, 0);
}

function getMonthlyDebtText(balance) {
  return getDebtPartyText(balance);
}

function closeMonth() {
  const month = getMonth();
  if (month.source) {
    window.alert("אפשר לסגור אוטומטית רק את חודשי 2026. חודשי הארכיון נשארים כחובות עבר.");
    return;
  }

  const stats = getMonthStats(month);
  ensureDebtStructures(state);
  const existingIndex = state.debts.monthClosures.findIndex((item) => item.monthName === month.name);
  const closure = {
    monthName: month.name,
    delta: stats.debtDelta,
    gap: Math.abs(stats.debtDelta),
    payer: stats.debtDelta === 0 ? "" : stats.payer,
    receiver: stats.debtDelta === 0 ? "" : stats.receiver,
    betty: stats.betty,
    itai: stats.itai,
    total: stats.total,
    closedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    state.debts.monthClosures[existingIndex] = closure;
  } else {
    state.debts.monthClosures.push(closure);
  }

  persistState();
  render();
  openDebts();
  window.alert(`החודש נסגר. ${getMonthlyDebtText(getMonthlyDebtBalance())}: ${money(Math.abs(getMonthlyDebtBalance()))}`);
}

function openDebts() {
  els.debtPanel.hidden = false;
  renderDebts();
  els.debtPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeDebts() {
  els.debtPanel.hidden = true;
}

function toggleMonthClosuresInTotal() {
  ensureDebtStructures(state);
  state.debts.includeMonthClosuresInTotal = !state.debts.includeMonthClosuresInTotal;
  persistState();
  renderDebts();
}

function formatMonth(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(date);
}

function render() {
  const month = getMonth();
  renderCategorySelect();
  const stats = getMonthStats(month);
  renderSummary(stats);
  renderCategories(stats);
  renderDebts();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

els.monthSelect.addEventListener("change", (event) => {
  selectedMonth = Number(event.target.value);
  render();
});

els.entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const category = getMonth().categories[Number(form.get("category"))];
  category.items.push({
    name: String(form.get("name") || "").trim(),
    betty: Number(form.get("betty")) || 0,
    itai: Number(form.get("itai")) || 0,
    manual: true,
    protected: false,
  });
  event.currentTarget.reset();
  event.currentTarget.elements.betty.value = 0;
  event.currentTarget.elements.itai.value = 0;
  persistState();
  render();
});

els.categories.addEventListener("change", (event) => {
  const input = event.target;
  if (!input.matches("input[data-field]")) return;
  const category = getMonth().categories[Number(input.dataset.category)];
  const item = category.items[Number(input.dataset.item)];
  item[input.dataset.field] = input.dataset.field === "name" ? input.value : Number(input.value) || 0;
  persistState();
  render();
});

els.categories.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-delete-category]");
  if (!button) return;
  const category = getMonth().categories[Number(button.dataset.deleteCategory)];
  const item = category.items[Number(button.dataset.deleteItem)];
  if (item?.protected) {
    window.alert("זו שורה שהגיעה מהאקסל, ולכן לא ניתן למחוק אותה מתוך המערכת.");
    return;
  }
  category.items.splice(Number(button.dataset.deleteItem), 1);
  persistState();
  render();
});

els.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "התחשבנות-בטי-איתי-2026.json";
  link.click();
  URL.revokeObjectURL(url);
});

els.importInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  state = JSON.parse(await file.text());
  state = migrateState(state);
  selectedMonth = 0;
  persistState();
  renderSelectors();
  render();
  event.target.value = "";
});

els.saveCloudSettingsBtn.addEventListener("click", () => {
  const config = getCloudConfigFromInputs();
  saveCloudConfig(config);
  if (!hasCloudConfig(config)) {
    setCloudStatus("צריך למלא כתובת Google Apps Script וגם קוד סודי.", true);
    return;
  }
  setCloudStatus("החיבור נשמר. בודק טעינה מהענן...");
  loadCloudState();
});

els.loadCloudBtn.addEventListener("click", () => loadCloudState());
els.saveCloudBtn.addEventListener("click", () => saveCloudState());

els.closeMonthBtn.addEventListener("click", closeMonth);
els.addMonthBtn.addEventListener("click", addNextMonth);
els.openDebtsBtn.addEventListener("click", openDebts);
els.closeDebtsBtn.addEventListener("click", closeDebts);
els.toggleMonthClosuresInTotalBtn.addEventListener("click", toggleMonthClosuresInTotal);

renderSelectors();
render();
initCloudSync();
