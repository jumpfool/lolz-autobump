const logger = require("./logger");

class BumpService {
  constructor() {
    this.apiUrl = "https://prod-api.lolz.live/threads";
  }

  async bumpTopic(topicId, apiToken) {
    logger.lolzInfo(`Попытка поднять тему #${topicId}`);

    try {
      const url = `${this.apiUrl}/${topicId}/bump`;
      const options = {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${apiToken}`,
        },
      };

      const response = await fetch(url, options);
      const json = await response.json();

      if (response.ok) {
        logger.simple(`Тема #${topicId} поднята!`);
        return {
          success: true,
          topicId: topicId,
          message: `Тема #${topicId} поднята!`,
          data: json,
        };
      } else {
        const errorMsg = json.errors?.[0] || json.error || "Неизвестная ошибка";
        logger.lolzError(`Не удалось поднять тему #${topicId}: ${errorMsg}`);
        return {
          success: false,
          topicId: topicId,
          error: errorMsg,
          data: json,
        };
      }
    } catch (error) {
      logger.lolzError(
        `Ошибка при поднятии темы #${topicId}: ${error.message}`,
      );
      return {
        success: false,
        topicId: topicId,
        error: error.message,
      };
    }
  }

  async bumpMultipleTopics(topicIds, apiToken) {
    const results = [];

    for (const topicId of topicIds) {
      const result = await this.bumpTopic(topicId, apiToken);
      results.push(result);

      logger.incrementBumpCount();

      if (topicIds.indexOf(topicId) < topicIds.length - 1) {
        await this._delay(500);
      }
    }

    return results;
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new BumpService();
