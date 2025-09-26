const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");

const BDAYS_DATA = path.join(__dirname, "../res/bdays.json");
const { today, bdays_data } = parseBdays();

function parseBdays(file = BDAYS_DATA) {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const bdays_data = JSON.parse(raw);

    const today = new Date().toISOString().slice(0, 10);

    return { today, bdays_data };
  } catch (err) {
    console.error("Ошибка чтения bdays.json:", err.message);
    return null;
  }
}
// преобразование json в массив
const entries = Object.entries(bdays_data).map(([name, d]) => ({
  name, ...d,
}));

const dayAfterWeek = dayjs().add(7, "day").format("YYYY-MM-DD");

// проверка на др сегодня
const birthdaysToday = entries.filter(e => e.date === today)
const birthdaysInWeek = entries.filter(e => e.date === dayAfterWeek)

// можно возвращать
console.log("Именинники сегодня:", birthdaysToday);
console.log("Именинники ровно через неделю:", birthdaysInWeek);

module.exports = { parseBdays };
