import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import Parser from "rss-parser";
import http from "http";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const parser = new Parser();
const users = new Set();

// -------- START --------
bot.onText(/\/start/, (msg) => {
  users.add(msg.chat.id);
  bot.sendMessage(
    msg.chat.id,
    `📊 MarketPulse

/news → Full brief`
  );
});

// -------- TRUSTED SOURCES --------
const TRUSTED = [
  "reuters","bbc","ndtv","economictimes","indiatoday",
  "thehindu","livemint","onmanorama","mathrubhumi",
  "hindustantimes"
];

// -------- CLEAN --------
const clean = (text) => {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\|.*$/g, "")
    .trim();
};

const isTrusted = (item) => {
  const url = item.link || "";
  return TRUSTED.some((s) => url.includes(s));
};

const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
};

// -------- CONTENT --------
const getContent = (item) => {
  let text = clean(item.contentSnippet || item.title);
  return text.substring(0, 200) + "...";
};

// -------- SMART IMPACT (ONLY WHEN RELEVANT) --------
const getImpact = (text) => {
  const t = text.toLowerCase();

  // HIGH relevance
  if (t.includes("oil") || t.includes("crude"))
    return "📉 Oil → Inflation ↑ → Market pressure";

  if (t.includes("rbi") || t.includes("interest rate"))
    return "🏦 Rates → Banking & liquidity impact";

  if (t.includes("inflation"))
    return "📊 Inflation → Policy tightening risk";

  if (t.includes("us fed") || t.includes("fii"))
    return "💰 Global flows → Market movement";

  if (t.includes("china") && t.includes("economy"))
    return "📈 China slowdown → India opportunity";

  if (t.includes("budget") || t.includes("tax"))
    return "🏛 Fiscal policy → Sector shifts";

  // NOT relevant → return null
  return null;
};

// -------- SOURCE --------
const getSource = (item) => {
  const url = item.link || "";

  if (url.includes("reuters")) return "Reuters";
  if (url.includes("bbc")) return "BBC";
  if (url.includes("ndtv")) return "NDTV";
  if (url.includes("economictimes")) return "ET";
  if (url.includes("thehindu")) return "The Hindu";
  if (url.includes("livemint")) return "Mint";

  return "News";
};

// -------- FORMAT --------
const formatSection = (title, items) => {
  if (items.length === 0) return "";

  let msg = `\n━━━ ${title} ━━━\n`;

  items.slice(0, 3).forEach((item) => {
    const fullText = item.title + " " + (item.contentSnippet || "");

    const impact = getImpact(fullText);

    msg += `\n🔹 ${getContent(item)}\n`;

    // ONLY show impact if relevant
    if (impact) {
      msg += `   ${impact}\n`;
    }

    msg += `   📰 ${getSource(item)} | 📅 ${formatDate(item.pubDate)}\n`;
  });

  return msg;
};

// -------- FETCH --------
async function fetchNews() {
  try {
    const feed = await parser.parseURL(
      "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en"
    );

    const filtered = feed.items.filter(isTrusted);
    return filtered.length ? filtered : feed.items.slice(0, 10);
  } catch {
    return [];
  }
}

// -------- BUILD --------
async function buildMessage() {
  const items = await fetchNews();
  if (items.length === 0) return "⚠️ News unavailable";

  const geo = items.slice(0, 3);
  const india = items.slice(3, 6);
  const market = items.slice(6, 9);

  let message = `📊 *Market Intelligence Brief*\n`;

  message += formatSection("🌍 GLOBAL", geo);
  message += formatSection("🇮🇳 INDIA", india);
  message += formatSection("📈 MARKETS", market);

  return message;
}

// -------- COMMAND --------
bot.onText(/\/news/, async (msg) => {
  bot.sendMessage(msg.chat.id, "🧠 Preparing brief...");
  const message = await buildMessage();
  bot.sendMessage(msg.chat.id, message, { parse_mode: "Markdown" });
});

// -------- AUTO --------
setInterval(async () => {
  const now = new Date();
  if (now.getHours() === 8 && now.getMinutes() === 0) {
    const message = await buildMessage();
    users.forEach((chatId) => {
      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    });
  }
}, 60000);

// -------- KEEP ALIVE --------
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.end("Alive");
}).listen(PORT);