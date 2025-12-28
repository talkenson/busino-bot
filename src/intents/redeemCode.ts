import { validate as uuidValidate } from "uuid";
import { Bot, Context, Composer } from "grammy";
import {
  type Conversation,
  type ConversationFlavor,
  conversations,
  createConversation,
} from "@grammyjs/conversations";
import { kv } from "../kv.ts";
import { getCurrentDay, getUserKey } from "../helpers.ts";
import type { UserState } from "../types.ts";
import {
  ADMINS,
  CAPTCHA_ITEMS,
  CURRENT_KEY,
  DICE_COST,
} from "../../constants.ts";
import type { InlineKeyboardButton, Message } from "grammy/types";
import { locales } from "../locales.ts";
import { sendEvent } from "../report/reporter.ts";
import { createCaptcha } from "../challenges/captcha.ts";
import { plural } from "../utils.ts";

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

  async function redeemFlow(conversation: Conversation, ctx: Context) {
    if (!ctx.message?.text || !ctx.chat) return;

    if (ctx.chat.type !== "private") {
      return await ctx.reply(
        "Получить бесплатную крутку ты можешь отправив мне эту команду в личные сообщения 😄",
        {
          reply_parameters: {
            message_id: ctx.message?.message_id,
          },
        },
      );
    }

    const userId = ctx.from?.id;

    if (!userId) return;

    const codeText = ctx.message?.text.split(/\s+/)[1];

    if (!codeText || !uuidValidate(codeText)) {
      await conversation.external(() =>
        sendEvent({
          event_type: "redeem",
          payload: {
            type: "invalid",
            chat_id: ctx.chat!.id,
            user_id: userId,
            code_text: codeText,
          },
        }),
      );
      return await ctx.reply(`Код недействителен`);
    }

    const code = await conversation.external(() =>
      kv.get<Code>(getCodeKey(codeText)).then(
        (state): Code =>
          state.value ?? {
            active: false,
          },
      ),
    );

    if (code.active) {
      if (code.issuedBy === userId) {
        ctx.reply("Упс, а вот свой код обналичить нельзя 🥲");
        await conversation.external(() =>
          sendEvent({
            event_type: "redeem",
            payload: {
              type: "self_redeem",
              chat_id: ctx.chat!.id,
              user_id: userId,
              code_text: codeText,
            },
          }),
        );
        return;
      }

      const userState = await conversation.external(() =>
        kv
          .get<UserState>(getUserKey(userId))
          .then((state) => state.value ?? undefined),
      );

      if (!userState) {
        return await ctx.reply(
          "Пока ты не сделаешь хотя бы одну крутку - ты не сможешь пользоваться чужими кодами 🥲",
        );
      }

      let captchaPassed = false;
      let captchaAttempts = 0;
      let captchaMessage: Message | undefined;
      let captcha: ReturnType<typeof createCaptcha> | undefined;
      const limit = 1;

      while (!captchaPassed && captchaAttempts < limit) {
        captcha = await conversation.external(() =>
          createCaptcha(codeText, CAPTCHA_ITEMS),
        );

        const captchaText = `${captchaAttempts > 0 ? `Увы, неверно, у Вас осталось ${plural(limit - captchaAttempts, ["попытка", "попытки", "попыток"], true)}` : ""}
<b>${captcha.pattern}</b>\nВыбери снизу самый подходящий смайлик`;

        const rows = Math.ceil(captcha.items.length / 5);
        const splitAfter = Math.max(0, Math.ceil(captcha.items.length / rows));
        const splittedData = [];
        for (let i = 0; i < rows; i++) {
          splittedData.push(
            captcha.items
              .slice(i * splitAfter, (i + 1) * splitAfter)
              .map((emojiData) => {
                return {
                  text: emojiData.text,
                  callback_data: emojiData.data.toString(),
                };
              }),
          );
        }

        const keyboard = {
          inline_keyboard: splittedData,
        };

        if (captchaMessage) {
          const cm = await ctx.api.editMessageText(
            captchaMessage.chat.id,
            captchaMessage.message_id,
            captchaText,
            {
              parse_mode: "HTML",
              reply_markup: keyboard,
            },
          );
          if (cm !== true) {
            captchaMessage = cm;
          }
        } else {
          captchaMessage = await ctx.reply(captchaText, {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        }

        const cb = await conversation.waitFor("callback_query:data");

        if (cb.callbackQuery.data === captcha.targetId.toString()) {
          captchaPassed = true;
        } else {
          captchaAttempts++;
          continue;
        }
      }

      if (captchaMessage)
        await ctx.api
          .deleteMessage(captchaMessage.chat.id, captchaMessage.message_id)
          .catch();

      const repeatedCode = await conversation.external(() =>
        kv.get<Code>(getCodeKey(codeText)).then(
          (state): Code =>
            state.value ?? {
              active: false,
            },
        ),
      );

      if (!repeatedCode.active) {
        return await ctx.reply(
          "Ойй 😬, кажется пока кто-то решал капчу – кодик уже уплыл! 😜",
        );
      }

      if (!captchaPassed) {
        await conversation.external(() =>
          sendEvent({
            event_type: "redeem",
            payload: {
              type: "captcha_failed",
              chat_id: ctx.chat!.id,
              user_id: userId,
              code_text: codeText,
              captcha_pattern: captcha?.pattern,
              captcha_target: captcha?.targetId,
              captcha_items: captcha?.items,
            },
          }),
        );

        return await ctx.reply("Увы, неверно. Сделайте /redeem снова");
      } else {
        await conversation.external(() =>
          sendEvent({
            event_type: "redeem",
            payload: {
              type: "captcha_succeed",
              chat_id: ctx.chat!.id,
              user_id: userId,
              code_text: codeText,
              captcha_pattern: captcha?.pattern,
              captcha_target: captcha?.targetId,
              captcha_items: captcha?.items,
            },
          }),
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

      await conversation.external(() =>
        kv
          .atomic()
          .delete(getCodeKey(codeText))
          .set(getUserKey(userId), nextUserState)
          .commit(),
      );

      if (code.chatId && code.messageId) {
        await bot.api.editMessageText(
          code.chatId,
          code.messageId,
          locales.freespinRedeemedQuote(),
          {
            parse_mode: "HTML",
          },
        );
      }

      await conversation.external(() =>
        sendEvent({
          event_type: "redeem",
          payload: {
            type: "success",
            chat_id: ctx.chat!.id,
            user_id: userId,
            code_text: codeText,
            redeem_interval: Date.now() - code.issuedAt,
          },
        }),
      );

      return await ctx.reply(
        `Вот это скорость! У вас теперь есть еще одна крутка, и она будет действовать до полуночи`,
      );
    }

    await conversation.external(() =>
      sendEvent({
        event_type: "redeem",
        payload: {
          type: "already_redeemed",
          chat_id: ctx.chat!.id,
          user_id: userId,
          code_text: codeText,
        },
      }),
    );

    return await ctx.reply("Сорри, этот код уже кто-то успел активировать 🤯");
  }

  const composer = new Composer<ConversationFlavor<Context>>();

  composer.use(
    conversations({
      onExit(id, ctx) {
        ctx.reply("Вы отвечали слишком долго, используйте /redeem снова");
      },
    }),
  );

  composer.use(
    createConversation(redeemFlow, {
      maxMillisecondsToWait: 15_000,
    }),
  );

  composer.command("redeem", async (ctx) => {
    await ctx.conversation.enter("redeemFlow");
  });

  // @ts-ignore -- Композер нужен только в этом контексте
  bot.use(composer);
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
