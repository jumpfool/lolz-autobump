const { Telegraf } = require("telegraf");
const fs = require("fs").promises;
const path = require("path");
const readline = require("readline");
const logger = require("./logger");
const bumpService = require("./bumpService");

const DB_PATH = path.join(__dirname, "database.json");
let bot = null;
let config = null;
let bumpInterval = null;

async function loadConfig() {
  try {
    const data = await fs.readFile(DB_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

async function saveConfig(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(question) {
  const rl = createReadline();
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function setupWizard() {
  logger.logGreen("lolz autobump bot");
  console.log("запуск настройки...");

  // Check for environment variables first (for Docker deployment)
  let token = process.env.BOT_TOKEN;
  let adminId = process.env.ADMIN_ID;
  let lolzToken = process.env.LOLZ_API_TOKEN;

  // If environment variables are not set, prompt user
  if (!token) {
    token = await prompt("введите токен telegram бота: ");
  } else {
    console.log(
      "токен telegram бота загружен из переменной окружения BOT_TOKEN",
    );
  }

  if (!token || token.trim() === "") {
    console.log("ошибка: токен бота обязателен");
    process.exit(1);
  }

  if (!adminId) {
    adminId = await prompt("введите id администратора: ");
  } else {
    console.log("id администратора загружен из переменной окружения ADMIN_ID");
  }

  if (!adminId || isNaN(parseInt(adminId))) {
    console.log("ошибка: id администратора должен быть числом");
    process.exit(1);
  }

  if (!lolzToken) {
    lolzToken = await prompt("введите токен lolz.live api: ");
  } else {
    console.log(
      "токен lolz.live api загружен из переменной окружения LOLZ_API_TOKEN",
    );
  }

  if (!lolzToken || lolzToken.trim() === "") {
    console.log("ошибка: токен lolz.live api обязателен");
    process.exit(1);
  }

  const configData = {
    botToken: token.trim(),
    adminId: parseInt(adminId),
    lolzApiToken: lolzToken.trim(),
    topics: [],
    bumpInterval: 0,
    setupComplete: false,
  };
  await saveConfig(configData);
  console.log("конфигурация сохранена в database.json");
  console.log(
    "теперь отправьте /start боту в telegram для завершения настройки",
  );
  return configData;
}

async function performBump(topicId) {
  logger.incrementBumpCount();

  const result = await bumpService.bumpTopic(topicId, config.lolzApiToken);

  if (config.setupComplete) {
    if (result.success) {
      await sendNotification(result.message, topicId);
    } else {
      await sendErrorNotification(result.error, topicId);
    }
  }

  return result;
}

async function sendNotification(message, topicId) {
  logger.telgInfo(`Отправляем уведомление #${topicId}...`);

  try {
    await bot.telegram.sendMessage(config.adminId, message);
  } catch (error) {
    logger.telgError(`Ошибка отправки: ${error.message}`);
  }
}

async function sendErrorNotification(errorMessage, topicId) {
  logger.telgInfo(`Отправляем уведомление об ошибке #${topicId}...`);

  try {
    const cleanError = errorMessage
      .replace(/<br>/g, "\n")
      .replace(/<[^>]*>/g, "");
    await bot.telegram.sendMessage(
      config.adminId,
      `ошибка при поднятии темы #${topicId}:\n${cleanError}`,
    );
  } catch (error) {
    logger.telgError(`Ошибка отправки: ${error.message}`);
  }
}

async function startAutobump() {
  if (!config.setupComplete || config.topics.length === 0) {
    return;
  }

  let currentIndex = 0;

  const bumpNext = async () => {
    const topicId = config.topics[currentIndex];
    await performBump(topicId);

    currentIndex = (currentIndex + 1) % config.topics.length;
  };

  await bumpNext();

  if (config.bumpInterval > 0) {
    bumpInterval = setInterval(async () => {
      await bumpNext();
    }, config.bumpInterval);
  }
}

function stopAutobump() {
  if (bumpInterval) {
    clearInterval(bumpInterval);
    bumpInterval = null;
  }
}

async function resetConfig(ctx) {
  if (ctx.from.id !== config.adminId) {
    return ctx.reply("доступ запрещен");
  }

  stopAutobump();

  config.topics = [];
  config.bumpInterval = 0;
  config.setupComplete = false;
  await saveConfig(config);

  ctx.reply("конфигурация сброшена. отправьте /start для повторной настройки");
  logger.sysInfo("конфигурация сброшена администратором");
}

function initBot() {
  bot = new Telegraf(config.botToken);

  bot.command("start", async (ctx) => {
    if (ctx.from.id !== config.adminId) {
      return ctx.reply("доступ запрещен");
    }

    if (config.setupComplete) {
      return ctx.reply(
        "бот уже настроен\n\n" +
          "используйте /status для просмотра настроек\n" +
          "используйте /reset для повторной настройки",
      );
    }

    ctx.reply(
      "добро пожаловать в autobump bot\n\n" +
        "отправьте id тем для поднятия (через запятую)\n" +
        "пример: 38123722,38123723,38123724",
    );

    config.awaitingTopics = true;
    await saveConfig(config);
  });

  bot.command("reset", resetConfig);

  bot.command("status", async (ctx) => {
    if (ctx.from.id !== config.adminId) {
      return ctx.reply("доступ запрещен");
    }

    const bumpCount = logger.getBumpCount();
    const intervalMinutes = Math.floor(config.bumpInterval / 60000);
    const topicsWithHash = config.topics.map((id) => `#${id}`).join(", ");

    ctx.reply(
      `статус:\n\n` +
        `темы: ${topicsWithHash}\n` +
        `интервал: ${intervalMinutes} минут\n` +
        `всего поднятий: ${bumpCount}\n` +
        `активен: ${config.setupComplete ? "да" : "нет"}`,
    );
  });

  bot.on("text", async (ctx) => {
    if (ctx.from.id !== config.adminId) {
      return;
    }

    if (config.awaitingTopics) {
      const topicsStr = ctx.message.text.split(",");
      const topics = topicsStr
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id));

      if (topics.length === 0) {
        return ctx.reply("неверные id тем. попробуйте снова");
      }

      config.topics = topics;
      config.awaitingTopics = false;
      config.awaitingInterval = true;
      await saveConfig(config);

      const topicsWithHash = topics.map((id) => `#${id}`).join(", ");
      ctx.reply(
        `темы сохранены: ${topicsWithHash}\n\n` +
          "теперь отправьте интервал поднятия в минутах\n" +
          "пример: 60 (для 1 часа)",
      );
    } else if (config.awaitingInterval) {
      const minutes = parseInt(ctx.message.text.trim());

      if (isNaN(minutes) || minutes < 1) {
        return ctx.reply("неверный интервал. отправьте число больше 0");
      }

      config.bumpInterval = minutes * 60000;
      config.awaitingInterval = false;
      config.setupComplete = true;
      await saveConfig(config);

      const topicsWithHash = config.topics.map((id) => `#${id}`).join(", ");
      ctx.reply(
        `настройка завершена!\n\n` +
          `темы: ${topicsWithHash}\n` +
          `интервал: ${minutes} минут\n\n` +
          `автоподнятие запущено\n` +
          `используйте /reset для повторной настройки или удалите database.json`,
      );

      logger.sysInfo("настройка завершена, запуск автоподнятия...");
      await startAutobump();
    }
  });

  bot.catch((err, ctx) => {
    logger.telgError(`bot error: ${err.message}`);
    console.error("bot error:", err);
  });
}

async function main() {
  config = await loadConfig();

  if (!config) {
    config = await setupWizard();
  } else {
    logger.logGreen("lolz autobump bot");
    console.log("конфигурация загружена из database.json");

    if (!config.setupComplete) {
      console.log(
        "настройка не завершена. отправьте /start в telegram для продолжения",
      );
    } else {
      console.log("настройка завершена. запуск автоподнятия...");
    }
  }

  initBot();

  try {
    await bot.launch();
    logger.sysInfo("бот успешно запущен");

    if (config.setupComplete) {
      await startAutobump();
    }
  } catch (error) {
    console.error("ошибка запуска бота:", error);
    process.exit(1);
  }

  process.once("SIGINT", () => {
    console.log("\nостановка бота...");
    stopAutobump();
    bot.stop("SIGINT");
  });

  process.once("SIGTERM", () => {
    console.log("\nостановка бота...");
    stopAutobump();
    bot.stop("SIGTERM");
  });
}

main().catch((error) => {
  console.error("критическая ошибка:", error);
  process.exit(1);
});
