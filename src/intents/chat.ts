import { Bot } from "grammy";
import { sendEvent } from "../report/reporter.ts";
import {
  getChatDataKey,
  getChatSettingsKey,
  getChatNotificationKey,
} from "../keys.ts";
import { kv } from "../kv.ts";
import { createDefaultSettings, type ChatData } from "./types.ts";
import { isAdmin, stripFirst } from "../helpers.ts";
import { ADMINS } from "../../constants.ts";

export default (bot: Bot) => {
  bot.command("regchat", async (ctx) => {
    const userId = ctx.from?.id;

    if (!userId || !ctx?.message?.message_id) return;

    const isAdminUser = isAdmin(bot, ctx, true);

    if (!isAdminUser) {
      await ctx.reply("У вас нет прав, доступно только владельцу", {
        reply_parameters: {
          message_id: ctx.message?.message_id,
        },
      });
      return;
    }

    try {
      const a = kv.atomic();
      a.set(getChatDataKey(ctx.chat.id), {
        name: ctx.chat.title,
        username: ctx.chat.username,
      } as ChatData);
      a.set(getChatNotificationKey(ctx.chat.id), true);
      a.set(getChatSettingsKey(ctx.chat.id), createDefaultSettings());
      await a.commit();
      await ctx.reply("Чат успешно зарегистрирован", {
        reply_parameters: {
          message_id: ctx.message?.message_id,
        },
      });

      sendEvent({
        event_type: "regchat",
        payload: {
          type: "success",
          chat_id: ctx.chat.id,
          name: ctx.chat.title,
          username: ctx.chat.username,
        },
      });
    } catch (e) {
      console.error(e);
      await ctx.reply("Чат не зарегистрирован", {
        reply_parameters: {
          message_id: ctx.message?.message_id,
        },
      });
      sendEvent({
        event_type: "regchat",
        payload: {
          type: "error",
          chat_id: ctx.chat.id,
          name: ctx.chat.title,
          username: ctx.chat.username,
          error: e?.toString() || e || "Unknown error",
        },
      });
    }

    return;
  });

  bot.command("notification", async (ctx) => {
    if (!ctx.message?.text || !ctx.from.id) return;

    const userId = ctx.from?.id;
    if (!userId) return;

    const isAdminUser = isAdmin(bot, ctx, true);

    if (!isAdminUser) {
      await ctx.reply("У вас нет прав, доступно только владельцу", {
        reply_parameters: {
          message_id: ctx.message?.message_id,
        },
      });
      return;
    }

    const notification = await kv.get<boolean>(
      getChatNotificationKey(ctx.chat.id),
    );

    const [action] = stripFirst(ctx.message.text).split(/\s+/);

    if (action === "get") {
      if (notification.value === null) {
        await ctx.reply("Уведомления не настроены", {
          reply_parameters: {
            message_id: ctx.message?.message_id,
          },
        });
        return;
      }

      await ctx.reply(
        `Уведомления ${notification.value ? "ВКЛ" : "ВЫКЛ"} (используйте 'allow/deny')`,
        {
          reply_parameters: {
            message_id: ctx.message?.message_id,
          },
        },
      );
      return;
    } else if (action === "allow") {
      if (!isAdmin) {
        await ctx.reply("У вас нет прав", {
          reply_parameters: {
            message_id: ctx.message?.message_id,
          },
        });
        return;
      }

      await kv.set(getChatNotificationKey(ctx.chat.id), true);
      await ctx.reply(`Уведомления "ВКЛ" (используйте 'set allow/deny')`, {
        reply_parameters: {
          message_id: ctx.message?.message_id,
        },
      });
    } else if (action === "deny") {
      if (!isAdmin) {
        await ctx.reply("У вас нет прав", {
          reply_parameters: {
            message_id: ctx.message?.message_id,
          },
        });
        return;
      }

      await kv.set(getChatNotificationKey(ctx.chat.id), false);
      await ctx.reply(`Уведомления "ВЫКЛ" (используйте 'set allow/deny')`, {
        reply_parameters: {
          message_id: ctx.message?.message_id,
        },
      });
    } else {
      await ctx.reply("Неизвестное действие", {
        reply_parameters: {
          message_id: ctx.message?.message_id,
        },
      });
      return;
    }
  });
};
