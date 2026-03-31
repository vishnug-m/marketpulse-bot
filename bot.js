import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import Parser from "rss-parser";
import http from "http";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

const parser = new Parser();
const users = new Set();

// -------- START --------
bot.onText(/\/start/, (msg) => {
  users.add(msg.chat.id);
  bot.sendMessage(
    msg.chat.id,
    `📊 MarketPulse

/news → Normal brief  
/search <keyword> → Custom news (example: /search oil india)`
  );
});

// -------- TRUSTED --------
const TRUSTED = [
  "reuters","bbc","ndtv","economictimes","indiatoday",
  "thehindu","livemint","onmanorama","mathrubhumi",
  "hindustantimes"
];

// -------- HELPERS --------
const clean = (text) =>
  (text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\|.*$/g, "")
    .trim();

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

const getContent = (item) => {
  let text = clean(item.contentSnippet || item.title);
  return text.substring(0, 200) + "...";
};

// -------- SMART IMPACT --------
const getImpact = (text) => {
  const t = text.toLowerCase();

  if (t.includes("oil")) return "📉 Oil → Inflation ↑";
  if (t.includes("rbi")) return "🏦 RBI → Rate impact";
  if (t.includes("inflation")) return "📊 Inflation risk";
  if (t.includes("fii") || t.includes("us")) return "💰 Capital flows impact";
  if (t.includes("budget") || t.includes("tax")) return "🏛 Policy shift";

  return null;
};

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

  items.slice(0, 5).forEach((item) => {
    const text = item.title + " " + (item.contentSnippet || "");
    const impact = getImpact(text);

    msg += `\n🔹 ${getContent(item)}\n`;

    if (impact) {
      msg += `   ${impact}\n`;
    }

    msg += `   📰 ${getSource(item)} | 📅 ${formatDate(item.pubDate)}\n`;
  });

  return msg;
};

// -------- FETCH NORMAL --------
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

// -------- FETCH BY KEYWORD --------
async function fetchByKeyword(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=en-IN&gl=IN&ceid=IN:en`;

    const feed = await parser.parseURL(url);

    const filtered = feed.items.filter(isTrusted);
    return filtered.length ? filtered : feed.items.slice(0, 10);
  } catch {
    return [];
  }
}

// -------- NORMAL MODE --------
bot.onText(/\/news/, async (msg) => {
  bot.sendMessage(msg.chat.id, "🧠 Preparing brief...");

  const items = await fetchNews();
  if (items.length === 0) {
    bot.sendMessage(msg.chat.id, "⚠️ News unavailable");
    return;
  }

  const geo = items.slice(0, 3);
  const india = items.slice(3, 6);
  const market = items.slice(6, 9);

  let message = `📊 *Market Intelligence Brief*\n`;

  message += formatSection("🌍 GLOBAL", geo);
  message += formatSection("🇮🇳 INDIA", india);
  message += formatSection("📈 MARKETS", market);

  bot.sendMessage(msg.chat.id, message, { parse_mode: "Markdown" });
});

// -------- KEYWORD MODE --------
bot.onText(/\/search (.+)/, async (msg, match) => {
  const query = match[1];

  bot.sendMessage(msg.chat.id, `🔎 Searching: ${query}`);

  const items = await fetchByKeyword(query);

  if (items.length === 0) {
    bot.sendMessage(msg.chat.id, "No results found");
    return;
  }

  let message = `🔎 *Results for:* ${query}\n`;

  message += formatSection("📰 NEWS", items);

  bot.sendMessage(msg.chat.id, message, { parse_mode: "Markdown" });
});

// -------- AUTO --------
setInterval(async () => {
  const now = new Date();
  if (now.getHours() === 8 && now.getMinutes() === 0) {
    const items = await fetchNews();

    let message = `📊 *Morning Brief*\n`;
    message += formatSection("TOP NEWS", items);

    users.forEach((chatId) => {
      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    });
  }
}, 60000);

// -------- KEEP ALIVE --------

import http from "http";

const PORT = process.env.PORT || 3000;
const URL = process.env.RENDER_EXTERNAL_URL;

// Set webhook once
bot.setWebHook(`${URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`)
  .then(() => console.log("Webhook set"))
  .catch(err => console.log("Webhook error:", err));

http.createServer((req, res) => {
  if (
    req.method === "POST" &&
    req.url === `/bot${process.env.TELEGRAM_BOT_TOKEN}`
  ) {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        const update = JSON.parse(body);
        bot.processUpdate(update);
      } catch (e) {
        console.log("Update error:", e);
      }
      res.end("ok");
    });
  } else {
    res.end("running");
  }
}).listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});