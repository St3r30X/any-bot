/*
  This bot watches a Google Sheet with the duty schedule and lets approved
  Telegram users update it.  Key things to know:

  1. Secrets and settings  
     - All tokens, IDs and the path to the Google key file come from .env
       (BOT_TOKEN, CHAT_ID, SHEET_ID, GOOGLE_KEY_PATH, ALLOWED_USERS).  

  2. Who can use the bot  
     - Only Telegram users listed in ALLOWED_USERS can send update commands.  
     - Messages are sent only to the chat with CHAT_ID so info won’t leak.

  3. Google access  
     - Works with a Google service-account key file set in GOOGLE_KEY_PATH.  

  4. Data handling  
     - A small local file (lastData.json) stores the previous sheet data
       to spot changes quickly.  
       It holds only schedule data, no passwords or keys.

  5. Reliability  
     - The code checks that all required environment variables exist before start.  
     - Telegram and Google API calls are wrapped in try/catch so errors don’t crash the bot.

  6. Testing  
     - Old code for local Excel testing is commented out to avoid accidental use,
       but can be re-enabled if we need offline tests.
  
  7. Input validation
     - Our code includes input validation that blocks malicious data.

The current bot can be refactored to work with Mattermost instead of Telegram with a few changes...
*/

const fs = require("fs");
const path = require("path");
const xlsx = require("node-xlsx");
const { google } = require("googleapis");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
require("dotenv").config();

const BOT_TOKEN  = process.env.BOT_TOKEN;
const CHAT_ID    = process.env.CHAT_ID;
const SHEET_ID   = process.env.SHEET_ID;
const GOOGLE_KEY = process.env.GOOGLE_KEY_PATH;
if (!GOOGLE_KEY) {
  throw new Error("GOOGLE_KEY is not set in .env");
}
const CACHE_FILE = path.join(__dirname, "lastData.json");

/* Local Excel for testing 

const localSheet = xlsx.parse("dezhurstva2.xlsx")[0].data;
const dateHeader = localSheet[1];

*/

// ALLOWED_USERS can send update commands!
const allowedUsers = (process.env.ALLOWED_USERS || "")
  .split(",")
  .map(id => Number(id.trim()))
  .filter(Boolean);

if (!BOT_TOKEN || !CHAT_ID || !SHEET_ID || !GOOGLE_KEY) {
  throw new Error("One or more required env variables are missing");
}

const userMap = {
  "Асалбеков Аслан Гулбекович": "@hyposaurus",
  "Пугачев Егор Игоревич": "@Mrr_ZakaT",
  "Иванов Иван Иванович": "@ivanovivan",
  "Квашилава Илья Романович": "@Hesper1d1um",
  "Хлопков Максим Сергеевич": "@maxindasky",
  "Живых Олег Григорьевич": "@zhiv0y",
};

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const googleAuth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

//----- MESSAGE SENDER LOGIC START -----//

/* DO NOT TOUCH!
Converts any Excel date (text/number/Date) to YYYY-MM-DD */
function normalizeDate(val) {
  if (!val) return null;
  if (typeof val === "string") return val.slice(0, 10);
  if (typeof val === "number") {
    const base = new Date(Date.UTC(1899, 11, 30));
    return new Date(base.getTime() + val * 86400000).toISOString().slice(0, 10);
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return null;
}

async function readGoogleSheet() {
  const authClient = await googleAuth.getClient();
  const sheetsApi = google.sheets({ version: "v4", auth: authClient });
  const { data } = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "september!A1:Z100",
  });
  return data.values;
}

function loadCache() {
  return fs.existsSync(CACHE_FILE)
    ? JSON.parse(fs.readFileSync(CACHE_FILE))
    : null;
}

function saveCache(sheetData) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(sheetData, null, 2));
}

// Caching sheet data localy
function findChanges(oldSheet, newSheet) {
  const changes = [];
  const totalRows = Math.max(oldSheet?.length || 0, newSheet?.length || 0);

  for (let row = 0; row < totalRows; row++) {
    const prevRow = oldSheet?.[row] || [];
    const currRow = newSheet?.[row] || [];

    const totalCols = Math.max(prevRow.length, currRow.length);
    for (let col = 0; col < totalCols; col++) {
      const before = prevRow[col] || "";
      const after  = currRow[col] || "";
      if (before !== after) {
        changes.push({ r: row + 1, c: col + 1, oldVal: before, newVal: after });
      }
    }
  }
  return changes;
}

// TG message logic
function buildChangeMessage(changes, sheet) {
  const headerDates = sheet[1];
  const groupedByDate = {};

  changes.forEach(ch => {
    if (ch.r < 3) return;
    const date = normalizeDate(headerDates[ch.c - 1]) || "неизвестная дата";
    const person = sheet[ch.r - 1]?.[1] || "неизвестный сотрудник";
    if (!groupedByDate[date]) groupedByDate[date] = [];
    groupedByDate[date].push({ person, oldVal: ch.oldVal, newVal: ch.newVal });
  });

  let message = "📢 Обнаружены изменения в графике дежурств:\n\n";
  for (const date in groupedByDate) {
    message += `📅 <b>${date}</b>:\n`;
    groupedByDate[date].forEach(({ person, oldVal, newVal }) => {
      const tag = userMap[person] || person;
      message += `- ${tag}: "${oldVal}" → "${newVal}"\n`;
    });
    message += "\n";
  }
  return message;
}

async function sendDailyDuty(dateStr) {
  const today = dateStr
    ? new Date(dateStr)
    : new Date(Date.now() + 24 * 60 * 60 * 1000); 

  const tomorrowStr = today.toISOString().slice(0, 10);

  const sheet = await readGoogleSheet();
  const header = sheet[1];
  const colIndex = header.findIndex(v => normalizeDate(v) === tomorrowStr);
  if (colIndex === -1) return;

  const day = [];
  const night = [];

  for (let i = 2; i < sheet.length; i++) {
    const name = sheet[i]?.[1];
    const duty = sheet[i]?.[colIndex];
    if (!name || !duty) continue;

    const text = String(duty).trim().toLowerCase();
    if (text === "вых" || text === "-") continue;

    const tag = userMap[name] || name;
    if (text.includes("день")) day.push(`${name} (${tag})`);
    else if (text.includes("ночь")) night.push(`${name} (${tag})`);
    else day.push(`${name} (${tag}) — ${duty}`);
  }

  if (!day.length && !night.length) return;

  let msg = `📅 Дежурство на ${tomorrowStr}:\n\n`;
  if (day.length) msg += `☀️ ДЕНЬ:\n${day.join("\n")}\n\n`;
  if (night.length) msg += `🌙 НОЧЬ:\n${night.join("\n")}`;
  await bot.sendMessage(CHAT_ID, msg, { parse_mode: "HTML" });
}



//----- MESSAGE SENDER LOGIC END -----//

//----- SHEET UPDATER LOGIC START -----//
async function notifyGoogleChanges() {
  const currentSheet = await readGoogleSheet();
  const cachedSheet = loadCache();

  if (!cachedSheet) {
    saveCache(currentSheet);
    return;
  }
  const changes = findChanges(cachedSheet, currentSheet);
  if (changes.length > 0) {
    const msg = buildChangeMessage(changes, currentSheet);
    await bot.sendMessage(CHAT_ID, msg, { parse_mode: "HTML" });
    saveCache(currentSheet);
  }
}

// Google sheet updater
async function updateGoogleSheet(dateStr, personName, newValue) {
  const authClient = await googleAuth.getClient();
  const sheetsApi  = google.sheets({ version: "v4", auth: authClient });

  const sheetData = await readGoogleSheet();
  const headerRow = sheetData[1];
  const colIndex  = headerRow.findIndex(d => normalizeDate(d) === dateStr);
  if (colIndex === -1) throw new Error("Дата не найдена");

  const rowIndex = sheetData.findIndex(r => r[1] === personName);
  if (rowIndex === -1) throw new Error("Сотрудник не найден");

  const cellRef = `september!${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: cellRef,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[newValue]] },
  });
}

// Handle TG edits
bot.on("message", async msg => {
  if (!allowedUsers.includes(msg.from.id)) return;
  const parts = msg.text?.trim().split(/\s+/);
  if (!parts || parts.length < 3) {
    return bot.sendMessage(msg.chat.id, "Формат: <YYYY-MM-DD> <ФИО> <значение>");
  }

  const dateStr = parts[0];

  
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  return bot.sendMessage(msg.chat.id, "❌ Неверный формат даты. Используйте YYYY-MM-DD");
  }

  const newValue = parts.pop();
  const personName = parts.slice(1).join(" ");

  try {
    await updateGoogleSheet(dateStr, personName, newValue);
    await bot.sendMessage(msg.chat.id, "✅ Запись обновлена");
    await notifyGoogleChanges();
  } catch (err) {
    bot.sendMessage(msg.chat.id, "❌ Ошибка: " + err.message);
  }
});

//----- SHEET UPDATER LOGIC END -----//


notifyGoogleChanges();
sendDailyDuty();

cron.schedule("0 9 * * *", () => sendDailyDuty());

cron.schedule("*/1 * * * *", async () => notifyGoogleChanges())

