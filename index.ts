import { webhookCallback } from "grammy";
import { IS_PRODUCTION } from "./constants.ts";
import { logStart } from "./src/general.ts";
import { bot } from "./src/bot.ts";
import dice from "./src/intents/dice.ts";
import redeemCode from "./src/intents/redeemCode.ts";
import horses from "./src/intents/horses.ts";
import channel from "./src/intents/channel.ts";
import chat from "./src/intents/chat.ts";
import runnables from "./src/intents/runnables.ts";
import { sendEvent } from "./src/report/reporter.ts";

// init
runnables(bot);
chat(bot);
channel(bot);
dice(bot);
redeemCode(bot);
horses(bot);
// init end

bot.errorHandler = (error) => {
  console.error("Error happened: ", error);

  sendEvent({
    event_type: "error_handler",
    payload: {
      error: error.message,
      stack: error.stack,
      cause: error.cause,
      e: error.error,
    },
  });
};

logStart();

if (IS_PRODUCTION) {
  console.log("Listening on WebHook...");
  const handleUpdate = webhookCallback(bot, "bun");

  Bun.serve({
    async fetch(req) {
      if (req.method === "POST") {
        const url = new URL(req.url);
        if (url.pathname.slice(1) === bot.token) {
          try {
            return await handleUpdate(req);
          } catch (err) {
            console.error(err);
          }
        }
      }
      return new Response();
    },
  });
} else {
  bot.start();
}
