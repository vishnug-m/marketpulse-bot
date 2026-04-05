import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import Parser from "rss-parser";
import http from "http";

dotenv.config();

// -------- BOT --------
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const parser = new Parser({ timeout: 10000 });
const users = new Set();

// -------- START --------
bot.onText(/\/start/, (msg) => {
  users.add(msg.chat.id);
  bot.sendMessage(
    msg.chat.id,
    `📊 MarketPulse

/news → Daily Brief
/search <keyword> → Custom News`
  );
});

// -------- TRUSTED SOURCES --------
const TRUSTED = [
  "reuters","bbc","ndtv","economictimes","indiatoday",
  "thehindu","livemint","onmanorama","mathrubhumi",
  "hindustantimes"
];

// -------- CLEAN --------
const clean = (text) =>
  (text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\|.*$/g, "")
    .trim();

// -------- FILTER --------
const isTrusted = (item) => {
  const url = item.link || "";
  return TRUSTED.some((s) => url.includes(s));
};

const isSeriousNews = (text) => {
  const t = text.toLowerCase();
  if (
    t.includes("rape") ||
    t.includes("murder") ||
    t.includes("suicide") ||
    t.includes("assault") ||
    t.includes("crime")
  ) return false;
  return true;
};

// -------- DATE --------
const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
};

// -------- CONTENT --------
const getContent = (item) => {
  let text = clean(item.contentSnippet || item.content || item.title);
  text = text.replace(item.title, "").trim();
  return text.length > 50 ? text : clean(item.title);
};

// -------- MARKET RELEVANCE --------
const isMarketRelevant = (text) => {
  const t = text.toLowerCase();
  return (
    t.includes("oil") ||
    t.includes("crude") ||
    t.includes("inflation") ||
    t.includes("interest rate") ||
    t.includes("rbi") ||
    t.includes("fed") ||
    t.includes("fii") ||
    t.includes("gdp") ||
    t.includes("economy") ||
    t.includes("stock market")
  );
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
  items.slice(0, 4).forEach((item) => {
    msg += `\n🔹 ${clean(item.title)}\n`;
    msg += `   ${getContent(item)}\n`;
    msg += `   📰 ${getSource(item)} | 📅 ${formatDate(item.pubDate)}\n`;
  });
  return msg;
};

// -------- FETCH (PRIMARY + FALLBACK) --------
async function fetchNews() {
  try {
    const feed = await parser.parseURL(
      "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en"
    );

    if (!feed.items || feed.items.length === 0) {
      console.log("No items from RSS");
      return [];
    }

    console.log("Fetched:", feed.items.length);

    // fallback if trusted filter too strict
    const filtered = feed.items.filter(isTrusted);
    console.log("Filtered:", filtered.length);

    return filtered.length ? filtered : feed.items.slice(0, 12);

  } catch (err) {
    console.log("Fetch error:", err);
    return [];
  }
}

// -------- FETCH KEYWORD --------
async function fetchByKeyword(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=en-IN&gl=IN&ceid=IN:en`;

    const feed = await parser.parseURL(url);

    if (!feed.items || feed.items.length === 0) return [];

    const filtered = feed.items.filter(isTrusted);
    return filtered.length ? filtered : feed.items.slice(0, 10);

  } catch (err) {
    console.log("Search error:", err);
    return [];
  }
}

// -------- MAIN NEWS --------
bot.onText(/\/news/, async (msg) => {
  try {
    bot.sendMessage(msg.chat.id, "🧠 Preparing brief...");

    const items = await fetchNews();

    if (!items || items.length === 0) {
      bot.sendMessage(msg.chat.id, "⚠️ Unable to fetch news. Try again.");
      return;
    }

    let global = [];
    let india = [];
    let market = [];

    items.forEach((item) => {
      const text = (item.title + " " + item.contentSnippet).toLowerCase();

      if (!isSeriousNews(text)) return;

      if (isMarketRelevant(text)) {
        market.push(item);
      } else if (
        text.includes("india") ||
        text.includes("bjp") ||
        text.includes("modi")
      ) {
        india.push(item);
      } else {
        global.push(item);
      }
    });

    let message = `📊 *Market Intelligence Brief*\n`;
    message += formatSection("🌍 GLOBAL", global);
    message += formatSection("🇮🇳 INDIA", india);
    message += formatSection("📈 MARKET-RELEVANT", market);

    bot.sendMessage(msg.chat.id, message, { parse_mode: "Markdown" });

  } catch (err) {
    console.log("News error:", err);
    bot.sendMessage(msg.chat.id, "⚠️ Something went wrong.");
  }
});

// -------- SEARCH --------
bot.onText(/\/search (.+)/, async (msg, match) => {
  try {
    const query = match[1];
    bot.sendMessage(msg.chat.id, `🔎 Searching: ${query}`);

    const items = await fetchByKeyword(query);

    if (!items || items.length === 0) {
      bot.sendMessage(msg.chat.id, "No results found");
      return;
    }

    let message = `🔎 *Results for:* ${query}\n`;
    message += formatSection("📰 NEWS", items);

    bot.sendMessage(msg.chat.id, message, { parse_mode: "Markdown" });

  } catch (err) {
    console.log("Search error:", err);
    bot.sendMessage(msg.chat.id, "⚠️ Search failed");
  }
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

// -------- WEBHOOK SERVER --------
const PORT = process.env.PORT || 3000;
const URL = process.env.RENDER_EXTERNAL_URL;

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