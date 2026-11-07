// Add your Supabase project URL and anon/publishable key from Project Settings > API.
const SUPABASE_URL = "https://spptwhuqufaeipxogpcz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_4FN9deU7omFmSNwTjJ6kYQ_KbMxpCIN";
const TABLE_NAME = "transactions";
const DEFAULT_CATEGORIES = {
  expense: ["อาหาร", "เดินทาง", "ที่อยู่อาศัย", "ของใช้", "สุขภาพ", "บันเทิง", "บิล/ค่าสาธารณูปโภค", "อื่น ๆ"],
  income: ["เงินเดือน", "งานเสริม", "ลงทุน", "ของขวัญ", "คืนเงิน", "อื่น ๆ"],
  asset: ["เงินออม", "หุ้น", "ทองคำ", "สินทรัพย์ถาวร", "อื่น ๆ"],
};
const DEFAULT_ACCENT = "#23876c";
const currency = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const dateFormatter = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" });

const elements = {
  authView: document.querySelector("#auth-view"),
  appView: document.querySelector("#app-view"),
  authForm: document.querySelector("#auth-form"),
  authTitle: document.querySelector("#auth-title"),
  authDescription: document.querySelector("#auth-description"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  authSubmit: document.querySelector("#auth-submit"),
  authMessage: document.querySelector("#auth-message"),
  authSwitchLabel: document.querySelector("#auth-switch-label"),
  authSwitchButton: document.querySelector("#auth-switch-button"),
  accountBar: document.querySelector("#account-bar"),
  userEmail: document.querySelector("#user-email"),
  signOutButton: document.querySelector("#sign-out-button"),
  periodMode: document.querySelector("#period-mode"),
  monthPicker: document.querySelector("#month-picker"),
  yearPicker: document.querySelector("#year-picker"),
  monthPickerWrap: document.querySelector("#month-picker-wrap"),
  yearPickerWrap: document.querySelector("#year-picker-wrap"),
  balanceTotal: document.querySelector("#balance-total"),
  todayDelta: document.querySelector("#today-delta"),
  incomeTotal: document.querySelector("#income-total"),
  expenseTotal: document.querySelector("#expense-total"),
  incomeMonth: document.querySelector("#income-month"),
  incomeYear: document.querySelector("#income-year"),
  expenseMonth: document.querySelector("#expense-month"),
  expenseYear: document.querySelector("#expense-year"),
  assetTotal: document.querySelector("#asset-total"),
  assetHoldingsList: document.querySelector("#asset-holdings-list"),
  assetHoldingsEmpty: document.querySelector("#asset-holdings-empty"),
  dailyAverage: document.querySelector("#daily-average"),
  dailyAverageHint: document.querySelector("#daily-average-hint"),
  unpaidTotal: document.querySelector("#unpaid-total"),
  unreceivedTotal: document.querySelector("#unreceived-total"),
  transactionForm: document.querySelector("#transaction-form"),
  formTitle: document.querySelector("#form-title"),
  amount: document.querySelector("#amount"),
  assetActionWrap: document.querySelector("#asset-action-wrap"),
  assetAction: document.querySelector("#asset-action"),
  category: document.querySelector("#category"),
  transactionDate: document.querySelector("#transaction-date"),
  note: document.querySelector("#note"),
  recurringToggle: document.querySelector("#recurring-toggle"),
  recurringOptions: document.querySelector("#recurring-options"),
  recurrenceFrequency: document.querySelector("#recurrence-frequency"),
  saveButton: document.querySelector("#save-button"),
  cancelEditButton: document.querySelector("#cancel-edit-button"),
  transactionMessage: document.querySelector("#transaction-message"),
  transactionList: document.querySelector("#transaction-list"),
  transactionCount: document.querySelector("#transaction-count"),
  emptyState: document.querySelector("#empty-state"),
  recurringList: document.querySelector("#recurring-list"),
  recurringEmpty: document.querySelector("#recurring-empty"),
  recurringMessage: document.querySelector("#recurring-message"),
  themeSelect: document.querySelector("#theme-select"),
  accentColor: document.querySelector("#accent-color"),
  categoryForm: document.querySelector("#category-form"),
  categoryType: document.querySelector("#category-type"),
  newCategory: document.querySelector("#new-category"),
  expenseCategoryList: document.querySelector("#expense-category-list"),
  incomeCategoryList: document.querySelector("#income-category-list"),
  settingsMessage: document.querySelector("#settings-message"),
  typeButtons: [...document.querySelectorAll(".type-button")],
};

let supabaseClient;
let currentUser;
let selectedType = "expense";
let editingId = null;
let editingIsSettled = true;
let transactions = [];
let pendingTransactions = [];
let todayIncome = 0;
let todayExpense = 0;
let yearTransactions = [];
let assetTransactions = [];
let categories = [];
let recurringTemplates = [];
let occurrences = [];
let isSignUp = false;
let initializedUserId = null;

function showMessage(element, message, isSuccess = false) {
  element.textContent = message;
  element.classList.toggle("is-success", isSuccess);
}

function setBusy(button, busy, busyText, idleText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

function getLocalDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function selectedMonthBounds() {
  const month = elements.monthPicker.value || getLocalDate().slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { mode: "month", month, start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}`, days: lastDay };
}

function selectedYearBounds() {
  const currentYear = new Date().getFullYear();
  const year = Number(elements.yearPicker.value || currentYear);
  return { mode: "year", year, start: `${year}-01-01`, end: `${year}-12-31`, days: 365 };
}

function selectedPeriodBounds() {
  return elements.periodMode.value === "year" ? selectedYearBounds() : selectedMonthBounds();
}

function futureDaysInPeriod(period) {
  const today = new Date(`${getLocalDate()}T12:00:00`);
  const periodEnd = new Date(`${period.end}T12:00:00`);
  if (periodEnd < today) return 1;
  const diffDays = Math.ceil((periodEnd - today) / 86400000) + 1;
  return Math.max(1, diffDays);
}

function formatDate(dateString) {
  return dateFormatter.format(new Date(`${dateString}T12:00:00`));
}

function applyPreferences(preferences) {
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.style.setProperty("--green", preferences.accent_color);
  document.documentElement.style.setProperty("--green-dark", shadeColor(preferences.accent_color, -18));
  document.documentElement.style.setProperty("--green-foreground", getReadableTextColor(preferences.accent_color));
  elements.themeSelect.value = preferences.theme;
  elements.accentColor.value = preferences.accent_color;
}

function applyPeriodMode() {
  const isYear = elements.periodMode.value === "year";
  elements.monthPickerWrap.hidden = isYear;
  elements.yearPickerWrap.hidden = !isYear;
  elements.yearPicker.value = elements.yearPicker.value || new Date().getFullYear();
}

function getReadableTextColor(hex) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const luminance = channels
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.055;
  return whiteContrast >= darkContrast ? "#ffffff" : "#17212f";
}

function shadeColor(hex, amount) {
  const number = Number.parseInt(hex.slice(1), 16);
  const channels = [number >> 16, (number >> 8) & 255, number & 255];
  return `#${channels.map((channel) => Math.max(0, Math.min(255, channel + amount)).toString(16).padStart(2, "0")).join("")}`;
}

async function loadPreferences() {
  const { data, error } = await supabaseClient
    .from("user_preferences")
    .select("theme, accent_color")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    const defaults = { user_id: currentUser.id, theme: "light", accent_color: DEFAULT_ACCENT };
    const { error: insertError } = await supabaseClient.from("user_preferences").insert(defaults);
    if (insertError) throw insertError;
    applyPreferences(defaults);
    return;
  }
  applyPreferences(data);
}

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from("user_categories")
    .select("id, type, name, active")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  if (data.length === 0) {
    const defaults = Object.entries(DEFAULT_CATEGORIES).flatMap(([type, names]) =>
      names.map((name) => ({ user_id: currentUser.id, type, name, active: true })),
    );
    const { error: seedError } = await supabaseClient
      .from("user_categories")
      .upsert(defaults, { onConflict: "user_id,type,name", ignoreDuplicates: true });
    if (seedError) throw seedError;
    return loadCategories();
  }
  categories = data;
  renderCategorySettings();
  setCategories();
}

async function initializeUser(user) {
  const nextUserId = user?.id ?? null;
  if (initializedUserId === nextUserId) return;
  initializedUserId = nextUserId;
  currentUser = user;
  elements.authView.hidden = Boolean(user);
  elements.appView.hidden = !user;
  elements.accountBar.hidden = !user;
  elements.userEmail.textContent = user?.email ?? "";
  if (!user) {
    transactions = [];
    pendingTransactions = [];
    todayIncome = 0;
    todayExpense = 0;
    yearTransactions = [];
    assetTransactions = [];
    recurringTemplates = [];
    occurrences = [];
    categories = [];
    renderTransactions();
    renderRecurring();
    resetForm();
    return;
  }

  try {
    await Promise.all([loadPreferences(), loadCategories()]);
    await loadDashboardData();
  } catch (error) {
    initializedUserId = null;
    const message = `โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบว่ารัน database.sql แล้ว: ${error.message}`;
    showMessage(elements.transactionMessage, message);
    showMessage(elements.settingsMessage, message);
  }
}

function setCategories(legacyCategory = "") {
  const active = categories.filter((category) => category.type === selectedType && category.active);
  const names = active.map((category) => category.name);
  if (legacyCategory && !names.includes(legacyCategory)) names.unshift(legacyCategory);
  const previous = elements.category.value;
  elements.category.replaceChildren(...names.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = categories.some((category) => category.type === selectedType && category.name === name && !category.active)
      ? `${name} (หมวดหมู่เดิม)`
      : name;
    return option;
  }));
  if (names.length === 0) {
    elements.category.replaceChildren();
    const fallback = document.createElement("option");
    fallback.value = "";
    fallback.textContent = "ไม่มีหมวดหมู่ที่พร้อมใช้";
    elements.category.appendChild(fallback);
    elements.category.value = "";
    return;
  }
  if (names.includes(previous)) elements.category.value = previous;
}

function getEffectiveType(transaction) {
  if (transaction.type !== "asset") return transaction.type;
  return transaction.asset_action === "withdraw" ? "income" : "expense";
}

function getAssetActionLabel(action) {
  return action === "withdraw" ? "ถอน/ขายสินทรัพย์" : "นำเข้าสินทรัพย์";
}

function updateAssetActionVisibility() {
  elements.assetActionWrap.hidden = selectedType !== "asset";
}

function resetForm() {
  editingId = null;
  editingIsSettled = true;
  elements.transactionForm.reset();
  elements.recurringToggle.disabled = false;
  elements.transactionDate.value = getLocalDate();
  elements.formTitle.textContent = "เพิ่มรายการ";
  elements.saveButton.textContent = "บันทึกรายการ";
  elements.cancelEditButton.hidden = true;
  elements.recurringOptions.hidden = true;
  elements.assetAction.value = "add";
  updateAssetActionVisibility();
  showMessage(elements.transactionMessage, "");
  setCategories();
}

function dueDatesFor(template, endDate) {
  const [startYear, startMonth, startDay] = template.start_date.split("-").map(Number);
  const [endYear, endMonth] = endDate.split("-").map(Number);
  const dates = [];
  const makeDate = (year, month) => {
    const day = Math.min(startDay, new Date(Date.UTC(year, month, 0)).getUTCDate());
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  if (template.frequency === "monthly") {
    for (let year = startYear, month = startMonth; year < endYear || (year === endYear && month <= endMonth);) {
      const date = makeDate(year, month);
      if (date >= template.start_date && date <= endDate) dates.push(date);
      month += 1;
      if (month > 12) {
        year += 1;
        month = 1;
      }
    }
  } else {
    for (let year = startYear; year <= endYear; year += 1) {
      const date = makeDate(year, startMonth);
      if (date >= template.start_date && date <= endDate) dates.push(date);
    }
  }
  return dates;
}

async function createMissingOccurrences(templates, endDate) {
  if (templates.length === 0) return;
  const { data: existing, error: existingError } = await supabaseClient
    .from("recurring_occurrences")
    .select("recurring_id, due_date")
    .eq("user_id", currentUser.id)
    .in("recurring_id", templates.map((template) => template.id))
    .lte("due_date", endDate);
  if (existingError) throw existingError;
  const existingKeys = new Set(existing.map((item) => `${item.recurring_id}:${item.due_date}`));
  const rows = templates.flatMap((template) => dueDatesFor(template, endDate)
    .filter((dueDate) => !existingKeys.has(`${template.id}:${dueDate}`))
    .map((dueDate) => ({
    user_id: currentUser.id,
    recurring_id: template.id,
    due_date: dueDate,
    status: "pending",
    })));
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabaseClient
      .from("recurring_occurrences")
      .upsert(rows.slice(index, index + 500), {
        onConflict: "recurring_id,due_date",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
}

async function loadDashboardData() {
  const period = selectedPeriodBounds();
  const currentYear = new Date().getFullYear();
  const [transactionResult, templateResult, todayResult, yearResult, assetResult, pendingResult] = await Promise.all([
    supabaseClient
      .from(TABLE_NAME)
      .select("id, type, asset_action, is_settled, amount, category, note, transaction_date, created_at")
      .eq("user_id", currentUser.id)
      .gte("transaction_date", period.start)
      .lte("transaction_date", period.end)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabaseClient
      .from("recurring_transactions")
      .select("id, type, asset_action, amount, category, note, frequency, start_date, active")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: true }),
    supabaseClient
      .from(TABLE_NAME)
      .select("type, asset_action, is_settled, amount")
      .eq("user_id", currentUser.id)
      .eq("transaction_date", getLocalDate()),
    supabaseClient
      .from(TABLE_NAME)
      .select("type, asset_action, is_settled, amount, transaction_date")
      .eq("user_id", currentUser.id)
      .gte("transaction_date", `${currentYear}-01-01`)
      .lte("transaction_date", `${currentYear}-12-31`),
    supabaseClient
      .from(TABLE_NAME)
      .select("asset_action, amount, category, note")
      .eq("user_id", currentUser.id)
      .eq("type", "asset")
      .lte("transaction_date", getLocalDate()),
    supabaseClient
      .from(TABLE_NAME)
      .select("id, type, amount, category, note, transaction_date, created_at")
      .eq("user_id", currentUser.id)
      .eq("is_settled", false)
      .in("type", ["income", "expense"])
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true })
  ]);
  if (transactionResult.error) throw transactionResult.error;
  if (templateResult.error) throw templateResult.error;
  if (todayResult.error) throw todayResult.error;
  if (yearResult.error) throw yearResult.error;
  if (assetResult.error) throw assetResult.error;
  if (pendingResult.error) throw pendingResult.error;

  recurringTemplates = templateResult.data;
  await createMissingOccurrences(recurringTemplates.filter((template) => template.active), period.end);
  const occurrenceResult = await supabaseClient
    .from("recurring_occurrences")
    .select("id, recurring_id, due_date, status, paid_on, transaction_id")
    .eq("user_id", currentUser.id)
    .lte("due_date", period.end)
    .or(`status.eq.pending,due_date.gte.${period.start}`)
    .order("due_date", { ascending: true });
  if (occurrenceResult.error) throw occurrenceResult.error;

  transactions = transactionResult.data;
  pendingTransactions = pendingResult.data;
  yearTransactions = yearResult.data;
  assetTransactions = assetResult.data;
  todayIncome = todayResult.data
    .filter((transaction) => transaction.is_settled && getEffectiveType(transaction) === "income")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  todayExpense = todayResult.data
    .filter((transaction) => transaction.is_settled && getEffectiveType(transaction) === "expense")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  occurrences = occurrenceResult.data;
  renderTransactions();
  renderRecurring();
  showMessage(elements.transactionMessage, "");
  showMessage(elements.recurringMessage, "");
}

function renderTransactions() {
  const period = selectedPeriodBounds();
  const sumByEffectiveType = (items, type) => items.reduce(
    (sum, item) => item.is_settled && getEffectiveType(item) === type ? sum + Number(item.amount) : sum,
    0,
  );
  const income = sumByEffectiveType(transactions, "income");
  const expense = sumByEffectiveType(transactions, "expense");
  const balance = income - expense;
  const yearIncome = sumByEffectiveType(yearTransactions, "income");
  const yearExpense = sumByEffectiveType(yearTransactions, "expense");
  const assetTotal = assetTransactions.reduce(
    (sum, item) => sum + (item.asset_action === "withdraw" ? -1 : 1) * Number(item.amount),
    0,
  );
  const days = futureDaysInPeriod(period);
  const dailyAverage = balance / days;
  const todayDifference = dailyAverage - todayExpense;

  elements.balanceTotal.textContent = currency.format(balance);
  elements.incomeTotal.textContent = currency.format(todayIncome);
  elements.expenseTotal.textContent = currency.format(todayExpense);
  elements.incomeMonth.textContent = currency.format(income);
  elements.expenseMonth.textContent = currency.format(expense);
  elements.incomeYear.textContent = currency.format(yearIncome);
  elements.expenseYear.textContent = currency.format(yearExpense);
  elements.assetTotal.textContent = currency.format(assetTotal);
  renderAssetHoldings();
  elements.dailyAverage.textContent = currency.format(dailyAverage);
  elements.todayDelta.textContent = `วันนี้${todayDifference < 0 ? "เกิน" : "เหลือ"} ${todayDifference < 0 ? "−" : "+"}${currency.format(Math.abs(todayDifference))}`;
  elements.todayDelta.classList.toggle("is-over", todayDifference < 0);
  const settledTransactions = transactions.filter((item) => item.is_settled);
  elements.transactionCount.textContent = `${settledTransactions.length} รายการ`;
  elements.emptyState.hidden = settledTransactions.length > 0;
  elements.transactionList.replaceChildren(...settledTransactions.map(createTransactionElement));
}

function renderAssetHoldings() {
  const holdings = new Map();
  for (const transaction of assetTransactions) {
    const name = transaction.note?.trim() || transaction.category;
    const key = `${transaction.category}\u0000${name}`;
    const holding = holdings.get(key) || { name, category: transaction.category, amount: 0 };
    holding.amount += (transaction.asset_action === "withdraw" ? -1 : 1) * Number(transaction.amount);
    holdings.set(key, holding);
  }

  const rows = [...holdings.values()]
    .filter((holding) => holding.amount !== 0)
    .sort((left, right) => left.name.localeCompare(right.name, "th"));
  elements.assetHoldingsEmpty.hidden = rows.length > 0;
  elements.assetHoldingsList.replaceChildren(...rows.map((holding) => {
    const row = document.createElement("article");
    row.className = "asset-holding-item";
    const description = document.createElement("div");
    description.className = "asset-holding-description";
    const name = document.createElement("strong");
    name.textContent = holding.name;
    const category = document.createElement("span");
    category.textContent = holding.category;
    description.append(name, category);
    const amount = document.createElement("strong");
    amount.className = "asset-holding-amount";
    amount.textContent = currency.format(holding.amount);
    row.append(description, amount);
    return row;
  }));
}

function createTransactionElement(transaction) {
  const item = document.createElement("article");
  item.className = "transaction-item";
  const effectiveType = getEffectiveType(transaction);
  const symbol = document.createElement("span");
  symbol.className = `transaction-symbol${effectiveType === "income" ? " income-symbol" : ""}`;
  symbol.textContent = effectiveType === "income" ? "↙" : "↗";
  symbol.setAttribute("aria-hidden", "true");
  const info = document.createElement("div");
  info.className = "transaction-info";
  const title = document.createElement("strong");
  title.textContent = transaction.note || transaction.category;
  const detail = document.createElement("span");
  const assetAction = transaction.type === "asset" ? `${getAssetActionLabel(transaction.asset_action)} · ` : "";
  detail.textContent = `${assetAction}${transaction.category} · ${formatDate(transaction.transaction_date)}`;
  info.append(title, detail);
  const amount = document.createElement("span");
  amount.className = `transaction-amount ${effectiveType === "income" ? "income-text" : "expense-text"}`;
  amount.textContent = `${effectiveType === "income" ? "+" : "−"}${currency.format(Number(transaction.amount))}`;
  const actions = document.createElement("div");
  actions.className = "item-actions";
  const editButton = document.createElement("button");
  editButton.className = "icon-button";
  editButton.type = "button";
  editButton.textContent = "✎";
  editButton.setAttribute("aria-label", `แก้ไข ${transaction.note || transaction.category}`);
  editButton.addEventListener("click", () => startEditing(transaction));
  const deleteButton = document.createElement("button");
  deleteButton.className = "icon-button delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", `ลบ ${transaction.note || transaction.category}`);
  deleteButton.addEventListener("click", () => {
    deleteTransaction(transaction).catch((error) => showMessage(elements.transactionMessage, `ลบรายการไม่สำเร็จ: ${error.message}`));
  });
  actions.append(editButton, deleteButton);
  item.append(symbol, info, amount, actions);
  return item;
}

function startEditing(transaction) {
  editingId = transaction.id;
  editingIsSettled = transaction.is_settled;
  selectedType = transaction.type;
  elements.typeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.type === selectedType));
  elements.assetAction.value = transaction.asset_action || "add";
  updateAssetActionVisibility();
  setCategories(transaction.category);
  elements.amount.value = transaction.amount;
  elements.category.value = transaction.category;
  elements.transactionDate.value = transaction.transaction_date;
  elements.note.value = transaction.note || "";
  elements.recurringToggle.checked = false;
  elements.recurringToggle.disabled = true;
  elements.formTitle.textContent = "แก้ไขรายการ";
  elements.saveButton.textContent = "บันทึกการแก้ไข";
  elements.cancelEditButton.hidden = false;
  showMessage(elements.transactionMessage, "");
  elements.amount.focus();
}

async function deleteTransaction(transaction) {
  if (!window.confirm(`ลบรายการ "${transaction.note || transaction.category}" ใช่หรือไม่?`)) return;
  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .delete()
    .eq("id", transaction.id)
    .eq("user_id", currentUser.id);
  if (error) {
    showMessage(elements.transactionMessage, `ลบรายการไม่สำเร็จ: ${error.message}`);
    return;
  }
  await loadDashboardData().catch((loadError) => showMessage(elements.transactionMessage, `ลบแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ: ${loadError.message}`));
  if (editingId === transaction.id) resetForm();
}

function createRecurringOccurrenceElement(occurrence) {
  const template = recurringTemplates.find((item) => item.id === occurrence.recurring_id);
  if (!template) return null;
  const row = document.createElement("article");
  row.className = `recurring-item${occurrence.status === "paid" ? " is-paid" : ""}`;
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = occurrence.status === "paid";
  checkbox.disabled = occurrence.status === "paid";
  const effectiveType = getEffectiveType(template);
  const settlementLabel = effectiveType === "income" ? "รับแล้ว" : "จ่ายแล้ว";
  checkbox.setAttribute("aria-label", `${occurrence.status === "paid" ? settlementLabel : `ทำเครื่องหมายว่า${settlementLabel}`} ${template.note || template.category}`);
  checkbox.addEventListener("change", () => {
    settleOccurrence(occurrence).catch((error) => showMessage(elements.recurringMessage, `อัปเดตสถานะไม่สำเร็จ: ${error.message}`));
  });
  const description = document.createElement("div");
  description.className = "recurring-description";
  const title = document.createElement("strong");
  title.textContent = template.note || template.category;
  const due = document.createElement("span");
  const isOverdue = occurrence.status === "pending" && occurrence.due_date < getLocalDate();
  const assetAction = template.type === "asset" ? `${getAssetActionLabel(template.asset_action)} · ` : "";
  due.textContent = `${assetAction}${template.category} · ${occurrence.status === "paid" ? `${settlementLabel} ${formatDate(occurrence.paid_on)}` : `ครบกำหนด ${formatDate(occurrence.due_date)}${isOverdue ? " · ค้างชำระ" : ""}`}`;
  if (isOverdue) due.className = "overdue-text";
  description.append(title, due);
  const amount = document.createElement("span");
  amount.className = `transaction-amount ${effectiveType === "income" ? "income-text" : "expense-text"}`;
  amount.textContent = `${effectiveType === "income" ? "+" : "−"}${currency.format(Number(template.amount))}`;
  row.append(checkbox, description, amount);
  return row;
}

function renderRecurring() {
  const expensePending = occurrences.reduce((sum, occurrence) => {
    const template = recurringTemplates.find((item) => item.id === occurrence.recurring_id);
    return occurrence.status === "pending" && template && getEffectiveType(template) === "expense"
      ? sum + Number(template.amount)
      : sum;
  }, pendingTransactions
    .filter((transaction) => getEffectiveType(transaction) === "expense")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0));
  const incomePending = occurrences.reduce((sum, occurrence) => {
    const template = recurringTemplates.find((item) => item.id === occurrence.recurring_id);
    return occurrence.status === "pending" && template && getEffectiveType(template) === "income"
      ? sum + Number(template.amount)
      : sum;
  }, pendingTransactions
    .filter((transaction) => getEffectiveType(transaction) === "income")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0));
  elements.unpaidTotal.textContent = currency.format(expensePending);
  elements.unreceivedTotal.textContent = currency.format(incomePending);
  const pendingRows = pendingTransactions.map(createPendingTransactionElement);
  const occurrenceRows = occurrences.map(createRecurringOccurrenceElement).filter(Boolean);
  elements.recurringList.replaceChildren(...pendingRows, ...occurrenceRows);
  const activeTemplates = recurringTemplates.filter((template) => template.active).map(createTemplateElement);
  elements.recurringList.append(...activeTemplates);
  elements.recurringEmpty.hidden = pendingRows.length > 0 || occurrenceRows.length > 0 || activeTemplates.length > 0;
}

function createPendingTransactionElement(transaction) {
  const type = getEffectiveType(transaction);
  const settlementLabel = type === "income" ? "รับแล้ว" : "จ่ายแล้ว";
  const row = document.createElement("article");
  row.className = "recurring-item pending-transaction-item";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", `ทำเครื่องหมายว่า${settlementLabel} ${transaction.note || transaction.category}`);
  checkbox.addEventListener("change", () => {
    settlePendingTransaction(transaction, checkbox.checked)
      .catch((error) => showMessage(elements.recurringMessage, `อัปเดตสถานะไม่สำเร็จ: ${error.message}`));
  });
  const description = document.createElement("div");
  description.className = "recurring-description";
  const title = document.createElement("strong");
  title.textContent = transaction.note || transaction.category;
  const detail = document.createElement("span");
  const isOverdue = transaction.transaction_date < getLocalDate();
  detail.textContent = `${type === "income" ? "รายรับ" : "รายจ่าย"} · ${transaction.category} · ${type === "income" ? "คาดว่าจะได้รับ" : "ครบกำหนด"} ${formatDate(transaction.transaction_date)}${isOverdue ? " · เลยกำหนด" : ""}`;
  if (isOverdue) detail.className = "overdue-text";
  description.append(title, detail);
  const amount = document.createElement("span");
  amount.className = `transaction-amount ${type === "income" ? "income-text" : "expense-text"}`;
  amount.textContent = `${type === "income" ? "+" : "−"}${currency.format(Number(transaction.amount))}`;
  const actions = document.createElement("div");
  actions.className = "item-actions";
  const editButton = document.createElement("button");
  editButton.className = "icon-button";
  editButton.type = "button";
  editButton.textContent = "✎";
  editButton.setAttribute("aria-label", `แก้ไข ${transaction.note || transaction.category}`);
  editButton.addEventListener("click", () => startEditing(transaction));
  const deleteButton = document.createElement("button");
  deleteButton.className = "icon-button delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", `ลบ ${transaction.note || transaction.category}`);
  deleteButton.addEventListener("click", () => {
    deleteTransaction(transaction).catch((error) => showMessage(elements.transactionMessage, `ลบรายการไม่สำเร็จ: ${error.message}`));
  });
  actions.append(editButton, deleteButton);
  row.append(checkbox, description, amount, actions);
  return row;
}

async function settlePendingTransaction(transaction, isSettled) {
  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .update({ is_settled: isSettled })
    .eq("id", transaction.id)
    .eq("user_id", currentUser.id);
  if (error) throw error;
  await loadDashboardData();
}

function createTemplateElement(template) {
  const row = document.createElement("article");
  row.className = "template-item";
  const description = document.createElement("div");
  description.className = "recurring-description";
  const title = document.createElement("strong");
  title.textContent = template.note || template.category;
  const detail = document.createElement("span");
  const effectiveType = getEffectiveType(template);
  const typeLabel = effectiveType === "income" ? "รายรับ" : "รายจ่าย";
  const assetAction = template.type === "asset" ? `${getAssetActionLabel(template.asset_action)} · ` : "";
  detail.textContent = `${assetAction}${typeLabel} · ${template.frequency === "monthly" ? "ทุกเดือน" : "ทุกปี"} · เริ่ม ${formatDate(template.start_date)}`;
  description.append(title, detail);
  const amount = document.createElement("span");
  amount.className = `transaction-amount ${effectiveType === "income" ? "income-text" : "expense-text"}`;
  amount.textContent = `${effectiveType === "income" ? "+" : "−"}${currency.format(Number(template.amount))}`;
  const stopButton = document.createElement("button");
  stopButton.className = "button button-quiet stop-recurring";
  stopButton.type = "button";
  stopButton.textContent = "หยุดรายการ";
  stopButton.addEventListener("click", () => {
    stopRecurring(template).catch((error) => showMessage(elements.recurringMessage, `หยุดรายการไม่สำเร็จ: ${error.message}`));
  });
  row.append(description, amount, stopButton);
  return row;
}

async function settleOccurrence(occurrence) {
  const { error } = await supabaseClient.rpc("settle_recurring_occurrence", {
    p_occurrence_id: occurrence.id,
    p_paid_on: getLocalDate(),
  });
  if (error) {
    showMessage(elements.recurringMessage, `อัปเดตสถานะไม่สำเร็จ: ${error.message}`);
    await loadDashboardData().catch((loadError) => showMessage(elements.recurringMessage, loadError.message));
    return;
  }
  await loadDashboardData().catch((loadError) => showMessage(elements.recurringMessage, `บันทึกแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ: ${loadError.message}`));
}

async function stopRecurring(template) {
  if (!window.confirm(`หยุดสร้างรายการ "${template.note || template.category}" ในรอบถัดไปหรือไม่? ยอดค้างเดิมจะยังอยู่`)) return;
  const { error } = await supabaseClient
    .from("recurring_transactions")
    .update({ active: false })
    .eq("id", template.id)
    .eq("user_id", currentUser.id);
  if (error) {
    showMessage(elements.recurringMessage, `หยุดรายการไม่สำเร็จ: ${error.message}`);
    return;
  }
  await loadDashboardData().catch((loadError) => showMessage(elements.recurringMessage, loadError.message));
}

function renderCategorySettings() {
  renderCategoryList("expense", elements.expenseCategoryList);
  renderCategoryList("income", elements.incomeCategoryList);
  renderCategoryList("asset", document.querySelector("#asset-category-list"));
}

function renderCategoryList(type, container) {
  const rows = categories.filter((category) => category.type === type);
  container.replaceChildren(...rows.map((category) => {
    const row = document.createElement("div");
    row.className = `category-item${category.active ? "" : " category-inactive"}`;
    const name = document.createElement("span");
    name.textContent = category.name;
    const actions = document.createElement("div");
    actions.className = "category-actions";
    const rename = document.createElement("button");
    rename.className = "text-button";
    rename.type = "button";
    rename.textContent = "เปลี่ยนชื่อ";
    rename.addEventListener("click", () => {
      renameCategory(category).catch((error) => showMessage(elements.settingsMessage, `เปลี่ยนชื่อไม่สำเร็จ: ${error.message}`));
    });
    actions.append(rename);
    if (category.active) {
      const remove = document.createElement("button");
      remove.className = "text-button deactivate-category";
      remove.type = "button";
      remove.textContent = "ลบ";
      remove.addEventListener("click", () => {
        deleteCategory(category).catch((error) => showMessage(elements.settingsMessage, `ลบหมวดหมู่ไม่สำเร็จ: ${error.message}`));
      });
      actions.append(remove);
    } else {
      const activate = document.createElement("button");
      activate.className = "text-button";
      activate.type = "button";
      activate.textContent = "เปิดใช้";
      activate.addEventListener("click", () => {
        activateCategory(category).catch((error) => showMessage(elements.settingsMessage, `เปิดใช้หมวดหมู่ไม่สำเร็จ: ${error.message}`));
      });
      actions.append(activate);
      const remove = document.createElement("button");
      remove.className = "text-button deactivate-category";
      remove.type = "button";
      remove.textContent = "ลบ";
      remove.addEventListener("click", () => {
        deleteCategory(category).catch((error) => showMessage(elements.settingsMessage, `ลบหมวดหมู่ไม่สำเร็จ: ${error.message}`));
      });
      actions.append(remove);
    }
    row.append(name, actions);
    return row;
  }));
}

async function renameCategory(category) {
  const name = window.prompt("ชื่อหมวดหมู่ใหม่ (ชื่อเดิมในรายการย้อนหลังจะไม่เปลี่ยน)", category.name);
  if (name === null) return;
  const cleanedName = name.trim();
  if (!cleanedName || cleanedName.length > 40) {
    showMessage(elements.settingsMessage, "ชื่อหมวดหมู่ต้องมี 1–40 ตัวอักษร");
    return;
  }
  const { error } = await supabaseClient
    .from("user_categories")
    .update({ name: cleanedName })
    .eq("id", category.id)
    .eq("user_id", currentUser.id);
  if (error) {
    showMessage(elements.settingsMessage, `เปลี่ยนชื่อไม่สำเร็จ: ${error.message}`);
    return;
  }
  await loadCategories();
  showMessage(elements.settingsMessage, "เปลี่ยนชื่อแล้ว รายการย้อนหลังยังคงชื่อเดิม", true);
}

async function deleteCategory(category) {
  if (!window.confirm(`ลบหมวดหมู่ "${category.name}" หรือไม่? รายการย้อนหลังและรายการประจำที่ใช้ชื่อนี้จะไม่ถูกลบหรือเปลี่ยนชื่อ`)) return;
  const { error } = await supabaseClient
    .from("user_categories")
    .delete()
    .eq("id", category.id)
    .eq("user_id", currentUser.id);
  if (error) {
    showMessage(elements.settingsMessage, `ลบหมวดหมู่ไม่สำเร็จ: ${error.message}`);
    return;
  }
  await loadCategories();
  showMessage(elements.settingsMessage, "ลบหมวดหมู่แล้ว รายการย้อนหลังและรายการประจำยังคงชื่อเดิม", true);
}

async function activateCategory(category) {
  const { error } = await supabaseClient
    .from("user_categories")
    .update({ active: true })
    .eq("id", category.id)
    .eq("user_id", currentUser.id);
  if (error) {
    showMessage(elements.settingsMessage, `เปิดใช้หมวดหมู่ไม่สำเร็จ: ${error.message}`);
    return;
  }
  await loadCategories();
  showMessage(elements.settingsMessage, "เปิดใช้หมวดหมู่แล้ว", true);
}

elements.authSwitchButton.addEventListener("click", () => {
  isSignUp = !isSignUp;
  elements.authTitle.textContent = isSignUp ? "สร้างบัญชีใหม่" : "เข้าสู่ระบบ";
  elements.authDescription.textContent = isSignUp ? "สมัครสมาชิกเพื่อเริ่มบันทึกบัญชีของคุณ" : "เข้าสู่ระบบเพื่อจัดการบัญชีของคุณ";
  elements.authSubmit.textContent = isSignUp ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
  elements.authPassword.autocomplete = isSignUp ? "new-password" : "current-password";
  elements.authSwitchLabel.textContent = isSignUp ? "มีบัญชีอยู่แล้ว?" : "ยังไม่มีบัญชี?";
  elements.authSwitchButton.textContent = isSignUp ? "เข้าสู่ระบบ" : "สมัครสมาชิก";
  showMessage(elements.authMessage, "");
});

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(elements.authMessage, "");
  setBusy(elements.authSubmit, true, "กำลังดำเนินการ...", isSignUp ? "สมัครสมาชิก" : "เข้าสู่ระบบ");
  try {
    const credentials = { email: elements.authEmail.value.trim(), password: elements.authPassword.value };
    const { data, error } = isSignUp
      ? await supabaseClient.auth.signUp(credentials)
      : await supabaseClient.auth.signInWithPassword(credentials);
    if (error) throw error;
    if (isSignUp && !data.session) {
      showMessage(elements.authMessage, "สมัครสมาชิกแล้ว กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี", true);
    } else if (data.user) {
      await initializeUser(data.user);
    }
  } catch (error) {
    showMessage(elements.authMessage, error.message);
  } finally {
    setBusy(elements.authSubmit, false, "", isSignUp ? "สมัครสมาชิก" : "เข้าสู่ระบบ");
  }
});

elements.signOutButton.addEventListener("click", async () => {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) showMessage(elements.transactionMessage, `ออกจากระบบไม่สำเร็จ: ${error.message}`);
  } catch (error) {
    showMessage(elements.transactionMessage, `ออกจากระบบไม่สำเร็จ: ${error.message}`);
  }
});

elements.typeButtons.forEach((button) => button.addEventListener("click", () => {
  selectedType = button.dataset.type;
  elements.typeButtons.forEach((typeButton) => typeButton.classList.toggle("is-active", typeButton === button));
  updateAssetActionVisibility();
  setCategories();
}));

elements.recurringToggle.addEventListener("change", () => {
  elements.recurringOptions.hidden = !elements.recurringToggle.checked;
});

elements.transactionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(elements.transactionMessage, "");
  const wasEditing = Boolean(editingId);
  const isRecurring = elements.recurringToggle.checked && !wasEditing;
  const idleText = wasEditing ? "บันทึกการแก้ไข" : isRecurring ? "สร้างรายการประจำ" : "บันทึกรายการ";
  setBusy(elements.saveButton, true, "กำลังบันทึก...", idleText);
  const record = {
    user_id: currentUser.id,
    type: selectedType,
    asset_action: selectedType === "asset" ? elements.assetAction.value : null,
    is_settled: selectedType === "asset"
      || (elements.transactionDate.value <= getLocalDate() && (!wasEditing || editingIsSettled)),
    amount: Number(elements.amount.value),
    category: elements.category.value,
    note: elements.note.value.trim() || null,
    transaction_date: elements.transactionDate.value,
  };
  let saved = false;
  try {
    if (isRecurring) {
      const startDate = record.transaction_date;
      const template = { ...record };
      delete template.transaction_date;
      delete template.is_settled;
      const { error } = await supabaseClient.from("recurring_transactions").insert({
        ...template,
        start_date: startDate,
        frequency: elements.recurrenceFrequency.value,
      });
      if (error) throw error;
    } else {
      const query = editingId
        ? supabaseClient.from(TABLE_NAME).update(record).eq("id", editingId).eq("user_id", currentUser.id)
        : supabaseClient.from(TABLE_NAME).insert(record);
      const { error } = await query;
      if (error) throw error;
    }
    saved = true;
    resetForm();
    showMessage(elements.transactionMessage, isRecurring ? "สร้างรายการประจำแล้ว" : "บันทึกรายการแล้ว", true);
  } catch (error) {
    showMessage(elements.transactionMessage, `บันทึกไม่สำเร็จ: ${error.message}`);
  } finally {
    setBusy(elements.saveButton, false, "", wasEditing ? "บันทึกการแก้ไข" : "บันทึกรายการ");
  }
  if (!saved) return;
  await loadDashboardData().catch((error) => showMessage(elements.transactionMessage, `บันทึกแล้ว แต่โหลดข้อมูลใหม่ไม่สำเร็จ: ${error.message}`));
});

elements.cancelEditButton.addEventListener("click", () => {
  elements.recurringToggle.disabled = false;
  resetForm();
});

elements.monthPicker.addEventListener("change", () => {
  loadDashboardData().catch((error) => showMessage(elements.transactionMessage, `โหลดรายการไม่สำเร็จ: ${error.message}`));
});

elements.yearPicker.addEventListener("change", () => {
  loadDashboardData().catch((error) => showMessage(elements.transactionMessage, `โหลดรายการไม่สำเร็จ: ${error.message}`));
});

elements.periodMode.addEventListener("change", () => {
  applyPeriodMode();
  loadDashboardData().catch((error) => showMessage(elements.transactionMessage, `โหลดรายการไม่สำเร็จ: ${error.message}`));
});

elements.categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const name = elements.newCategory.value.trim();
    if (!name || name.length > 40) {
      showMessage(elements.settingsMessage, "ชื่อหมวดหมู่ต้องมี 1–40 ตัวอักษร");
      return;
    }
    const { error } = await supabaseClient.from("user_categories").insert({
      user_id: currentUser.id,
      type: elements.categoryType.value,
      name,
      active: true,
    });
    if (error) {
      showMessage(elements.settingsMessage, `เพิ่มหมวดหมู่ไม่สำเร็จ: ${error.message}`);
      return;
    }
    elements.categoryForm.reset();
    await loadCategories();
    showMessage(elements.settingsMessage, "เพิ่มหมวดหมู่แล้ว", true);
  } catch (error) {
    showMessage(elements.settingsMessage, `เพิ่มหมวดหมู่ไม่สำเร็จ: ${error.message}`);
  }
});

async function savePreferences(patch) {
  const preferences = {
    user_id: currentUser.id,
    theme: elements.themeSelect.value,
    accent_color: elements.accentColor.value,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseClient.from("user_preferences").upsert(preferences, { onConflict: "user_id" });
  if (error) {
    showMessage(elements.settingsMessage, `บันทึกการตั้งค่าไม่สำเร็จ: ${error.message}`);
    return;
  }
  applyPreferences(preferences);
  showMessage(elements.settingsMessage, "บันทึกการตั้งค่าแล้ว", true);
}

elements.themeSelect.addEventListener("change", () => {
  savePreferences({ theme: elements.themeSelect.value }).catch((error) => showMessage(elements.settingsMessage, `บันทึกการตั้งค่าไม่สำเร็จ: ${error.message}`));
});
elements.accentColor.addEventListener("change", () => {
  savePreferences({ accent_color: elements.accentColor.value }).catch((error) => showMessage(elements.settingsMessage, `บันทึกการตั้งค่าไม่สำเร็จ: ${error.message}`));
});

function startApp() {
  if (!window.supabase) {
    showMessage(elements.authMessage, "เชื่อมต่อ Supabase client ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต");
    elements.authSubmit.disabled = true;
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  elements.monthPicker.value = getLocalDate().slice(0, 7);
  elements.yearPicker.value = new Date().getFullYear();
  elements.periodMode.value = "month";
  applyPeriodMode();
  updateAssetActionVisibility();
  elements.transactionDate.value = getLocalDate();
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => {
      initializeUser(session?.user ?? null).catch((error) => {
        showMessage(elements.transactionMessage, `โหลดข้อมูลไม่สำเร็จ: ${error.message}`);
      });
    }, 0);
  });
  supabaseClient.auth.getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      return initializeUser(data.session?.user ?? null);
    })
    .catch((error) => showMessage(elements.authMessage, `ตรวจสอบสถานะเข้าสู่ระบบไม่สำเร็จ: ${error.message}`));
}

startApp();
