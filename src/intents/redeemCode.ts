import { validate as uuidValidate } from "uuid";
import { Bot } from "grammy";
import { kv } from "../kv.ts";
import { getCurrentDay, getUserKey } from "../helpers.ts";
import type { UserState } from "../types.ts";
import { ADMINS, CURRENT_KEY, DICE_COST } from "../../constants.ts";
import type { Message } from "grammy/types";
import { locales } from "../locales.ts";
import { sendEvent } from "../report/reporter.ts";

export const getCodeKey = (id: string) => [`${CURRENT_KEY}-code-treasure`, id];

export type Code =
  | {
      active: true;
      issuedBy: number;
      issuedAt: number;
      messageId?: number;
      chatId?: number;
    }
  | {
      active: false;
    };

export default (bot: Bot) => {
  bot.command("codegen", async (ctx) => {
    const userId = ctx.from?.id;

    if (!userId || !ADMINS.includes(userId.toString())) return;

    const codeText = crypto.randomUUID();

    const issueDate = Date.now();

    const code = await kv.set(getCodeKey(codeText), {
      active: true,
      issuedBy: 0,
      issuedAt: issueDate,
    } as Code);

    await sendEvent({
      event_type: "codegen",
      payload: {
        chat_id: ctx.chat.id,
        user_id: userId,
        code_text: codeText,
        issued_at: issueDate,
      },
    });

    return await ctx.reply(codeText);
  });

  bot.command("redeem", async (ctx) => {
    if (ctx.chat.type !== "private") {
      return await ctx.reply(
        "Получить бесплатную крутку ты можешь отправив мне эту команду в личные сообщения 😄",
      );
    }

    const userId = ctx.from?.id;

    if (!userId) return;

    const codeText = ctx.message?.text.split(/\s+/)[1];

    if (!codeText || !uuidValidate(codeText)) {
      await sendEvent({
        event_type: "redeem",
        payload: {
          type: "invalid",
          chat_id: ctx.chat.id,
          user_id: userId,
          code_text: codeText,
        },
      });
      return await ctx.reply(`Код недействителен`);
    }

    const code = await kv.get<Code>(getCodeKey(codeText)).then(
      (state): Code =>
        state.value ?? {
          active: false,
        },
    );

    if (code.active) {
      if (code.issuedBy === userId) {
        ctx.reply("Упс, а вот свой код обналичить нельзя 🥲");
        await sendEvent({
          event_type: "redeem",
          payload: {
            type: "self_redeem",
            chat_id: ctx.chat.id,
            user_id: userId,
            code_text: codeText,
          },
        });
        return;
      }

      const userState = await kv
        .get<UserState>(getUserKey(userId))
        .then((state) => state.value ?? undefined);

      if (!userState) {
        return await ctx.reply(
          "Пока ты не сделаешь хотя бы одну крутку - ты не сможешь пользоваться чужими кодами 🥲",
        );
      }

      if (code.chatId && code.messageId) {
        bot.api.editMessageText(
          code.chatId,
          code.messageId,
          locales.freespinRedeemedQuote(),
          {
            parse_mode: "HTML",
          },
        );
      }

      const currentDay = getCurrentDay();

      const isCurrentDay = currentDay.toMillis() === userState.lastDayUtc;

      const nextUserState: UserState = {
        ...userState,
        extraAttempts: isCurrentDay ? (userState?.extraAttempts ?? 0) + 1 : 1,
        lastDayUtc: isCurrentDay ? userState.lastDayUtc : currentDay.toMillis(), // if today then today or today
        attemptCount: isCurrentDay ? userState.attemptCount : 0,
        // coins: userState.coins + DICE_COST,
      };

      await kv
        .atomic()
        .delete(getCodeKey(codeText))
        .set(getUserKey(userId), nextUserState)
        .commit();

      await sendEvent({
        event_type: "redeem",
        payload: {
          type: "success",
          chat_id: ctx.chat.id,
          user_id: userId,
          code_text: codeText,
          redeem_interval: Date.now() - code.issuedAt,
        },
      });

      return await ctx.reply(
        `Вот это скорость! У вас теперь есть еще одна крутка, и она будет действовать до полуночи`,
      );
    }

    await sendEvent({
      event_type: "redeem",
      payload: {
        type: "already_redeemed",
        chat_id: ctx.chat.id,
        user_id: userId,
        code_text: codeText,
      },
    });

    return await ctx.reply("Сорри, этот код уже кто-то успел активировать 🤯");
  });
};

export const createFreespinCode = async (userId: number) => {
  const codeText = crypto.randomUUID();

  const issueDate = Date.now();

  await kv.set(getCodeKey(codeText), {
    active: true,
    issuedBy: userId,
    issuedAt: issueDate,
  } as Code);

  await sendEvent({
    event_type: "codegen",
    payload: {
      chat_id: 0,
      user_id: userId,
      code_text: codeText,
      issued_at: issueDate,
    },
  });

  return codeText;
};

export const linkFreespinCode = async (
  code: string,
  message: Message.TextMessage,
) => {
  const codeState = await kv
    .get<Code>(getCodeKey(code))
    .then((state) => state.value ?? undefined);

  if (!codeState || !codeState.active) return;

  await kv.set(getCodeKey(code), {
    ...codeState,
    messageId: message.message_id,
    chatId: message.chat.id,
  });
};
