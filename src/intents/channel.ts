import { Bot } from "grammy";
import { sendEvent } from "../report/reporter.ts";
import { getChatNotificationKey, withoutId } from "../keys.ts";
import { kv } from "../kv.ts";

export default (bot: Bot) => {
  bot.on("channel_post", async (ctx) => {
    if (ctx.chat.username !== "businonews") {
      try {
        await bot.api.leaveChat(ctx.chat.id);
        sendEvent({
          event_type: "leave_channel",
          payload: {
            chat_id: ctx.chat.id,
            status: true,
          },
        });
      } catch (e) {
        console.error(e);
        sendEvent({
          event_type: "leave_channel",
          payload: {
            chat_id: ctx.chat.id,
            status: false,
          },
        });
      }
    }

    const chats = await kv.list<boolean>({
      prefix: withoutId(getChatNotificationKey(1)),
    });

    const allowedChats: number[] = [];

    for await (const chat of chats) {
      if (chat.value === true) {
        const id = parseInt(chat.key.at(-1)! as string);

        allowedChats.push(id);
      }
    }

    allowedChats.forEach(async (chatId) => {
      try {
        await bot.api.forwardMessage(
          chatId,
          ctx.chat.id,
          ctx.channelPost.message_id,
        );
        sendEvent({
          event_type: "forward_channel_post",
          payload: {
            post: ctx.channelPost.message_id,
            chat_id: ctx.chat.id,
            status: true,
            error: "",
          },
        });
      } catch (e) {
        // console.error(e);
        sendEvent({
          event_type: "forward_channel_post",
          payload: {
            post: ctx.channelPost.message_id,
            chat_id: ctx.chat.id,
            status: false,
            error: e?.toString() || e || "Unknown error",
          },
        });
      }
    });
  });
};
