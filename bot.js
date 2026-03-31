import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import Parser from "rss-parser";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const parser = new Parser();

// -------- STORE USERS --------
const users = new Set();

// -------- START --------
bot.onText(/\/start/, (msg) => {
  users.add(msg.chat.id);

  bot.sendMessage(
    msg.chat.id,
    `📊 MarketPulse

Auto brief: 8 AM

/news → Full brief
/ent → Entertainment`
  );
});

// -------- TRUSTED SOURCES --------
const TRUSTED = [
  "reuters","bbc","ndtv","economictimes","indiatoday",
  "thehindu","livemint","onmanorama","mathrubhumi",
  "filmibeat","pinkvilla","hindustantimes"
];

// -------- CLEAN TEXT (FIX MAIN ISSUE) --------
const clean = (text) => {
  if (!text) return "";

  return text
    .replace(/<[^>]*>/g, "")           // remove HTML
    .replace(/&nbsp;/g, " ")           // remove nbsp
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/\|.*$/g, "")             // remove trailing sources after |
    .trim();
};

// -------- HELPERS --------
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

// -------- LONG CONTENT --------
const getContent = (item) => {
  let text =
    item.contentSnippet ||
    item.content ||
    item.title;

  text = clean(text);

  return text.substring(0, 220) + "...";
};

// -------- INSIGHT --------
const insight = (text) => {
  const t = text.toLowerCase();

  if (t.includes("oil")) return "📉 Inflation risk ↑";
  if (t.includes("china")) return "📈 India opportunity ↑";
  if (t.includes("us")) return "💰 FII flow impact";
  if (t.includes("war")) return "⚠️ Volatility ↑";
  if (t.includes("bjp") || t.includes("modi"))
    return "🏛 Policy → Sector impact";

  return "🔎 Monitor";
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
  if (url.includes("onmanorama")) return "Manorama";
  if (url.includes("mathrubhumi")) return "Mathrubhumi";
  if (url.includes("filmibeat")) return "Filmibeat";
  if (url.includes("pinkvilla")) return "Pinkvilla";
  if (url.includes("hindustantimes")) return "HT";

  return "News";
};

// -------- FORMAT (FIX SPACING) --------
const formatSection = (title, items) => {
  if (items.length === 0) return "";

  let msg = `\n━━━ ${title} ━━━\n`;

  items.slice(0, 3).forEach((item) => {
    const text = item.title + " " + (item.contentSnippet || "");

    msg += `\n🔹 ${getContent(item)}\n`;
    msg += `   ${insight(text)}\n`;
    msg += `   📰 ${getSource(item)} | 📅 ${formatDate(item.pubDate)}\n`;
  });

  return msg;
};

// -------- FETCH --------
async function fetchMainNews() {
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

async function fetchEntertainment() {
  try {
    const feed = await parser.parseURL(
      "https://news.google.com/rss/search?q=mohanlal+mammootty+vijay&hl=en-IN&gl=IN&ceid=IN:en"
    );

    return feed.items.filter(isTrusted).slice(0, 6);
  } catch {
    return [];
  }
}

// -------- BUILD --------
async function buildMessage() {
  const items = await fetchMainNews();
  const ent = await fetchEntertainment();

  if (items.length === 0) return "⚠️ News unavailable";

  const geo = items.slice(0, 3);
  const india = items.slice(3, 6);
  const market = items.slice(6, 9);

  let message = `📊 *Market Intelligence Brief*\n`;

  message += formatSection("🌍 GLOBAL", geo);
  message += formatSection("🇮🇳 INDIA", india);
  message += formatSection("📈 MARKETS", market);

  if (ent.length > 0) {
    message += formatSection("🎬 ENTERTAINMENT", ent);
  }

  return message;
}

// -------- COMMANDS --------
bot.onText(/\/news/, async (msg) => {
  bot.sendMessage(msg.chat.id, "🧠 Preparing brief...");
  const message = await buildMessage();
  bot.sendMessage(msg.chat.id, message, { parse_mode: "Markdown" });
});

bot.onText(/\/ent/, async (msg) => {
  const ent = await fetchEntertainment();
  const message = formatSection("🎬 ENTERTAINMENT", ent);
  bot.sendMessage(msg.chat.id, message || "No entertainment news");
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

// -------- DEFAULT --------
bot.on("message", (msg) => {
  if (msg.text.startsWith("/")) return;
  bot.sendMessage(msg.chat.id, "Use /news or /ent");
});