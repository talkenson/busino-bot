import { Bot } from "grammy";
import { ATTEMPTS_LIMIT, CASINO_DICE, DICE_COST } from "../../constants.ts";
import { getBankTax, getGasTax } from "../gasTax.ts";
import {
  DateTime,
  getCurrentDay,
  getDateFromMillis,
  getDaysWithoutRolls,
  getFreespinCode,
  getMaxFrequency,
  getPrize,
  getUserKey,
  initUserState,
} from "../helpers.ts";
import { kv } from "../kv.ts";
import { locales } from "../locales.ts";
import type { UserState } from "../types.ts";
import { linkFreespinCode } from "./redeemCode.ts";
import { isMoreRollsAvailable, plural } from "../utils.ts";
import { sendEvent } from "../report/reporter.ts";

export default (bot: Bot) =>
  bot.on(":dice", async (ctx) => {
    if (ctx.update.message?.dice.emoji === CASINO_DICE) {
      const { value } = ctx.update.message.dice;

      // https://core.telegram.org/api/dice
      const values = [0, 2, 4].map((shift) => ((value - 1) >> shift) & 0b11);

      const userId = ctx.from?.id;

      if (!userId) return;

      const isForwarded = Boolean(ctx.update.message?.forward_origin);

      if (isForwarded) {
        await ctx.reply(locales.doNotCheat(), {
          reply_to_message_id: ctx.update.message?.message_id,
        });
        await sendEvent({
          event_type: "dice",
          payload: {
            type: "forwarded",
            user_id: userId,
            chat_id: ctx.chat?.id,
            dice_value: value,
          },
        });
        return;
      }
      const userState = await kv
        .get<UserState>(getUserKey(userId))
        .then(
          (state) =>
            state.value ??
            initUserState(
              ctx.from?.username ||
                ctx.from?.first_name ||
                `User ID: ${userId}`,
            ),
        );

      const currentDay = getCurrentDay();

      const isCurrentDay = currentDay.toMillis() === userState.lastDayUtc;

      const isAttemptsLimitReached =
        userState.attemptCount >=
          ATTEMPTS_LIMIT + (userState.extraAttempts ?? 0) && isCurrentDay;

      if (isAttemptsLimitReached) {
        await ctx.reply(
          locales.attemptsLimit(
            ATTEMPTS_LIMIT + (userState.extraAttempts ?? 0),
          ),
          {
            reply_to_message_id: ctx.update.message?.message_id,
            parse_mode: "HTML",
          },
        );
        await sendEvent({
          event_type: "dice",
          payload: {
            type: "attempts_limit_reached",
            chat_id: ctx.chat.id,
            user_id: userId,
            dice_value: value,
          },
        });
        return;
      }

      const isExtraAttempt =
        isCurrentDay && userState.attemptCount >= ATTEMPTS_LIMIT;

      const gas = getGasTax(DICE_COST);
      const fixedLoss = isExtraAttempt ? gas + 2 : DICE_COST + gas; // 2 = service comission for every extra attempt

      if (userState.coins < fixedLoss) {
        await ctx.reply(locales.notEnoughCoins(fixedLoss), {
          reply_to_message_id: ctx.update.message?.message_id,
        });
        await sendEvent({
          event_type: "dice",
          payload: {
            type: "not_enough_coins",
            chat_id: ctx.chat.id,
            user_id: userId,
            dice_value: value,
            fixed_loss: fixedLoss,
          },
        });
        return;
      }

      const [maxFrequent, maxFrequency, rolls] = getMaxFrequency(values);

      const prize = getPrize(maxFrequent, maxFrequency, rolls);
      const isWin = prize - fixedLoss > 0;
      const daysWithoutRolls = getDaysWithoutRolls(
        currentDay,
        getDateFromMillis(userState.lastDayUtc),
      );
      const attemptsCount = isCurrentDay ? userState.attemptCount + 1 : 1;

      let tax = 0;
      let taxText = "";

      if (daysWithoutRolls > 0) {
        let lastBalance = userState.coins;
        console.log(daysWithoutRolls);
        for (let i = 0; i < daysWithoutRolls; i++) {
          const mod = 1 + (daysWithoutRolls - i) * 0.04;
          const currTax = getBankTax(lastBalance * mod);
          tax += currTax;
          lastBalance -= currTax;
        }
        taxText = locales.bankTax(tax, daysWithoutRolls);
      }

      const nextUserState: UserState = {
        ...userState,
        coins: userState.coins + prize - fixedLoss,
        lastDayUtc: currentDay.toMillis(),
        attemptCount: attemptsCount,
        extraAttempts: isCurrentDay ? userState.extraAttempts : 0,
      };

      await kv.set(getUserKey(userId), nextUserState);

      const isNotPrivateChat = ctx.chat.type !== "private";

      const result = isWin
        ? locales.win(prize, fixedLoss)
        : locales.lose(fixedLoss, prize);
      const yourBalance = locales.yourBalance(nextUserState.coins);

      const moreRolls = isMoreRollsAvailable(nextUserState);

      const attemptsLeft =
        moreRolls > 0
          ? `(у Вас ещё ${plural(moreRolls, ["попытка", "попытки", "попыток"], true)})`
          : "(у Вас больше не осталось попыток)";

      try {
        await ctx.reply(
          [result, yourBalance, attemptsLeft, taxText].join("\n"),
          {
            reply_to_message_id: ctx.update.message?.message_id,
            parse_mode: "HTML",
          },
        );
      } catch (error) {
        console.error("error on reply user", userId);
        return;
      }

      const freespinCode = isNotPrivateChat && (await getFreespinCode(userId));
      const freespinCodeIntergration =
        freespinCode && locales.freespinQuote(freespinCode);

      if (freespinCode && freespinCodeIntergration) {
        try {
          const reply = await ctx.reply(freespinCodeIntergration, {
            reply_to_message_id: ctx.update.message?.message_id,
            parse_mode: "HTML",
          });

          linkFreespinCode(freespinCode, reply);
        } catch (error) {
          console.error("error on reply user", userId);
        }
      }

      await sendEvent({
        event_type: "dice",
        payload: {
          type: "success",
          chat_id: ctx.chat.id,
          user_id: userId,
          dice_value: value,
          is_win: isWin,
          prize: prize,
          fixed_loss: fixedLoss,
          attempts_left: moreRolls,
          is_extra_attempt: isExtraAttempt,
          attemptsCount,
          tax: tax,
        },
      });

      return;
    }
  });
