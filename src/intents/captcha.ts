import { Bot } from "grammy";
import { sendEvent } from "../report/reporter.ts";
import { getChatNotificationKey, withoutId } from "../keys.ts";
import { kv } from "../kv.ts";

export default (bot: Bot) => {
  bot.on("channel_post", async (ctx) => {});
};
