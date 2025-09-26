const { parseBdays } = require("./birthdayReminder");
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../res/Pic.jpg");

async function bdayNotifier({ bot, chatId }) {
  const { birthdaysToday, birthdaysInWeek } = parseBdays();

  // сегодня
  if (birthdaysToday.length) {
    const names = birthdaysToday.map(x => x.name).join(", ");
    const tags = birthdaysToday
      .map(x => (x.username.startsWith("@") ? x.username : "@" + x.username))
      .join(" ");
    const caption =
      `🎉 Сегодня день рождения у: <b>${names}</b>\n\n` +
      `🥳 Поздравляем ${tags}! 🎂🎈`;

    await bot.sendPhoto(chatId, fs.createReadStream(filePath), {
      caption,
      parse_mode: "HTML",
    });
  }

  // через неделю
  if (birthdaysInWeek.length) {
    const names = birthdaysInWeek.map(x => x.name).join(", ");
    const tags = birthdaysInWeek
      .map(x => (x.username.startsWith("@") ? x.username : "@" + x.username))
      .join(" ");
    const msg =
      `📅 Через неделю празднуют: <b>${names}</b>\n\n` +
      `Не забудьте поздравить ${tags}! 🎁`;

    await bot.sendMessage(chatId, msg, { parse_mode: "HTML" });
  }
}

module.exports = { bdayNotifier };
