import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import Parser from "rss-parser";
import http from "http";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const parser = new Parser();
const users = new Map(); // store user keywords

// -------- START --------
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `📊 MarketPulse

Commands:
/set keyword1, keyword2
/news → get news based on your keywords`
  );
});

// -------- SET KEYWORDS --------
bot.onText(/\/set (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const keywords = match[1]
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  users.set(chatId, keywords);

  bot.sendMessage(
    chatId,
    `✅ Keywords set:\n${keywords.join(", ")}`
  );
});

// -------- CLEAN --------
const clean = (text) => {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// -------- FETCH --------
async function fetchNewsByKeywords(keywords) {
  try {
    const query = keywords.join(" ");
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=en-IN&gl=IN&ceid=IN:en`;

    const feed = await parser.parseURL(url);
    return feed.items.slice(0, 8);
  } catch {
    return [];
  }
}

// -------- FORMAT --------
const formatNews = (items) => {
  if (items.length === 0) return "⚠️ No news found";

  let msg = `📊 *Custom News Brief*\n`;

  items.forEach((item) => {
    msg += `\n🔹 ${clean(item.title)}\n`;
  });

  return msg;
};

// -------- NEWS --------
bot.onText(/\/news/, async (msg) => {
  const chatId = msg.chat.id;

  const keywords = users.get(chatId);

  if (!keywords || keywords.length === 0) {
    bot.sendMessage(
      chatId,
      "⚠️ Set keywords first using:\n/set india, oil, china"
    );
    return;
  }

  bot.sendMessage(chatId, "🔍 Fetching news...");

  const items = await fetchNewsByKeywords(keywords);

  const message = formatNews(items);

  bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
});

// -------- KEEP ALIVE --------
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.end("Alive");
}).listen(PORT);