import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import Parser from "rss-parser";
import http from "http";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const parser = new Parser();

// -------- SPLIT LONG MESSAGE --------
function sendLongMessage(chatId, text) {
  const maxLength = 4000;
  for (let i = 0; i < text.length; i += maxLength) {
    bot.sendMessage(chatId, text.substring(i, i + maxLength));
  }
}

// -------- CLEAN --------
const clean = (text) =>
  (text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[_*[\]()~`>#+=|{}.!-]/g, "") // prevent telegram error
    .trim();

// -------- FILTER --------
const isSeriousNews = (text) => {
  const t = text.toLowerCase();

  if (
    t.includes("rape") ||
    t.includes("murder") ||
    t.includes("suicide") ||
    t.includes("assault")
  ) return false;

  return true;
};

// -------- MARKET RELEVANCE --------
const isMarketRelevant = (text) => {
  const t = text.toLowerCase();

  return (
    t.includes("oil") ||
    t.includes("crude") ||
    t.includes("inflation") ||
    t.includes("rbi") ||
    t.includes("interest") ||
    t.includes("fed") ||
    t.includes("economy") ||
    t.includes("gdp")
  );
};

// -------- DATE --------
const formatDate = (date) => {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
};

// -------- CONTENT --------
const getContent = (item) => {
  const title = clean(item.title || "");
  let content = clean(item.contentSnippet || "");

  // Remove ALL occurrences of title (not just start)
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedTitle, "gi");
  content = content.replace(regex, "").trim();

  // Remove repeated phrases (Google News junk)
  content = content
    .split(". ")
    .filter((sentence, index, self) => 
      sentence && self.indexOf(sentence) === index
    )
    .join(". ")
    .trim();

  // Final cleanup
  content = content.replace(/\s+/g, " ").trim();

  // If still too similar or empty → fallback
  if (!content || content.length < 40) {
    return title;
  }

  return content;
};

// -------- FORMAT --------
const formatSection = (title, items) => {
  if (items.length === 0) return "";

  let msg = `\n━━━ ${title} ━━━\n`;

  items.slice(0, 3).forEach((item) => {
    msg += `\n🔹 ${clean(item.title)}\n`;
    msg += `   ${getContent(item)}\n`;
    msg += `   📰 ${formatDate(item.pubDate)}\n`;
  });

  return msg;
};

// -------- FETCH --------
async function fetchNews() {
  try {
    const feed = await parser.parseURL(
      "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en"
    );

    console.log("Fetched:", feed.items.length);

    return feed.items.slice(0, 12);
  } catch (err) {
    console.log("Fetch error:", err);
    return [];
  }
}

// -------- NEWS --------
bot.onText(/\/news/, async (msg) => {
  try {
    bot.sendMessage(msg.chat.id, "🧠 Preparing brief...");

    const items = await fetchNews();

    if (!items.length) {
      bot.sendMessage(msg.chat.id, "⚠️ News unavailable");
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
      } else if (text.includes("india")) {
        india.push(item);
      } else {
        global.push(item);
      }
    });

    let message = `📊 Market Intelligence Brief\n`;

    message += formatSection("🌍 GLOBAL", global);
    message += formatSection("🇮🇳 INDIA", india);
    message += formatSection("📈 MARKET", market);

    sendLongMessage(msg.chat.id, message);

  } catch (err) {
    console.log("Error:", err);
    bot.sendMessage(msg.chat.id, "⚠️ Something went wrong");
  }
});

// -------- WEBHOOK --------
const PORT = process.env.PORT || 3000;
const URL = process.env.RENDER_EXTERNAL_URL;

bot.setWebHook(`${URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`);

http.createServer((req, res) => {
  if (
    req.method === "POST" &&
    req.url === `/bot${process.env.TELEGRAM_BOT_TOKEN}`
  ) {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        const update = JSON.parse(body);
        bot.processUpdate(update);
      } catch {}
      res.end("ok");
    });
  } else {
    res.end("running");
  }
}).listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});