// ─────────────────────────────────────────────────────────────────────────────
// ВРЕМЯ (всё по МСК UTC+3)
// ─────────────────────────────────────────────────────────────────────────────
export function mskNow() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000);
}
export function todayISO() {
  return mskNow().toISOString().slice(0, 10);
}
export function monthISO() {
  const d = mskNow();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
}
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date(todayISO());
  return Math.ceil(diff / (1000*60*60*24));
}
export function getLast7() {
  return Array.from({length:7}, (_,i) => {
    const d = mskNow();
    d.setUTCDate(d.getUTCDate() - (6-i));
    return d.toISOString().slice(0,10);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ФОРМАТИРОВАНИЕ
// ─────────────────────────────────────────────────────────────────────────────
export const fmt = (n, dec=0) =>
  Number(n||0).toLocaleString("ru-RU", {minimumFractionDigits:dec, maximumFractionDigits:dec});

// ─────────────────────────────────────────────────────────────────────────────
// КОНСТАНТЫ
// ─────────────────────────────────────────────────────────────────────────────
export const DAY_SHORT  = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
export const DAY_FULL   = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
export const MONTH_NAMES= ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
export const MONTH_GEN  = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
export const HOURS      = Array.from({length:24}, (_,i) => i);

export const BLOCK_COLORS = {
  "сон":      "#3d405b",
  "учёба":    "#7b9ccc",
  "спорт":    "#e07a5f",
  "еда":      "#81b29a",
  "работа":   "#c9a96e",
  "отдых":    "#6b6760",
  "прогулка": "#81b29a",
  "телефон":  "#a06060",
  "свободно": "#2a2825",
};
export const BLOCK_TYPES = Object.keys(BLOCK_COLORS);

export const EXPENSE_CATS = ["🍔 Еда","🚇 Транспорт","☕ Кафе","🛒 Продукты","💊 Здоровье","📱 Подписки","👕 Одежда","🎮 Развлечения","📚 Учёба","💸 Другое"];
export const INCOME_CATS  = ["💼 Работа","🤝 Поддержка","📦 Прочее"];

export const REPEAT_TYPES = [
  { id:"daily",    label:"Каждый день" },
  { id:"weekdays", label:"По будням (пн–пт)" },
  { id:"weekends", label:"По выходным" },
  { id:"weekly",   label:"Раз в неделю" },
];

// Виджеты для верхней панели — пользователь выбирает 4
export const WIDGET_OPTIONS = [
  { id:"kcal",          label:"Калории",       icon:"🔥" },
  { id:"kcal_left",     label:"Осталось ккал", icon:"🥗" },
  { id:"steps",         label:"Шаги",          icon:"👣" },
  { id:"mood",          label:"Настроение",    icon:"🙂" },
  { id:"study_minutes", label:"Учёба (мин)",   icon:"📚" },
  { id:"day_balance",   label:"Баланс дня",    icon:"💰" },
  { id:"useful_time",   label:"Полезное время",icon:"⚡" },
];

// Секции вкладки День — пользователь управляет видимостью
export const DEFAULT_SECTIONS = [
  { id:"schedule",    label:"Расписание",         visible:true },
  { id:"study",       label:"Учёба",              visible:true },
  { id:"useful_time", label:"Полезное время",     visible:true },
  { id:"calories",    label:"Калории",            visible:true },
  { id:"steps",       label:"Шаги",              visible:true },
  { id:"note",        label:"Заметка дня",        visible:true },
  { id:"mood",        label:"Настроение",         visible:true },
  { id:"day_result",  label:"Итог дня",           visible:true },
];

export const DEFAULT_TOP_WIDGETS = ["kcal","steps","mood","day_balance"];
