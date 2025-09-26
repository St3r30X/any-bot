const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");

const BDAYS_DATA = path.join(__dirname, "../res/bdays.json");

function parseBdays(file = BDAYS_DATA) {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const bdays_data = JSON.parse(raw);

    const today = dayjs().format("YYYY-MM-DD");
    const dayAfterWeek = dayjs().add(7, "day").format("YYYY-MM-DD");

    // преобразование json в массив
    const entries = Object.entries(bdays_data).map(([name, d]) => ({
      name,
      ...d,
    }));

    const birthdaysToday = entries.filter(e => e.date === today);
    const birthdaysInWeek = entries.filter(e => e.date === dayAfterWeek);

    return { today, birthdaysToday, birthdaysInWeek };
  } catch (err) {
    console.error("Ошибка чтения bdays.json:", err.message);
    return { today: null, birthdaysToday: [], birthdaysInWeek: [] };
  }
}

module.exports = { parseBdays };
