import { Bot } from "grammy";
import {
  getCurrentDay,
  getDateFromMillis,
  getDaysBetween,
  getUserKey,
  getUserStateSafe,
  initUserState,
  stripFirst,
} from "../helpers.ts";
import { syncUsers } from "../runnables/syncUsers.ts";
import { locales } from "../locales.ts";
import {
  ADMINS,
  CURRENT_KEY,
  DAYS_OF_INACTIVITY_TO_HIDE_IN_TOP,
} from "../../constants.ts";
import { collectList, kv } from "../kv.ts";
import { formatUserToPlace } from "../utils.ts";
import { sendEvent, sendEvents } from "../report/reporter.ts";
import type { UserState } from "../types.ts";

export default (bot: Bot) => {
  bot.command("run", async (ctx) => {
    const userId = ctx.from?.id;

    if (!userId || !ctx?.message?.message_id) return;

    const isAdminUser = ADMINS.includes(userId.toString());

    if (!isAdminUser) {
      await ctx.reply("У вас нет прав, доступно только владельцу бота", {
        reply_parameters: {
          message_id: ctx.message?.message_id,
        },
      });

      await sendEvent({
        event_type: "admin_command",
        payload: {
          type: "insufficient_permissions",
          command: "not_admin",
          calleeId: userId,
        },
      });
      return;
    }

    const [action, ...args] = stripFirst(ctx.message.text).split(/\s+/);

    if (action === "usersync") {
      const count = await syncUsers();
      await ctx.reply("Пользователи синхронизированы", {
        reply_parameters: {
          message_id: ctx.message?.message_id,
        },
      });
      await sendEvent({
        event_type: "admin_command",
        payload: {
          command: "usersync",
          calleeId: userId,
          count: count,
        },
      });
    } else if (action === "userinfo") {
      if (!ctx.message.reply_to_message) {
        await ctx.reply(
          "Ответьте на сообщение пользователя с этой командой чтобы узнать его ID",
          {
            reply_parameters: {
              message_id: ctx.message?.message_id,
            },
          },
        );
        return;
      }
      await ctx.reply(
        `ID отправителя: <code>${ctx.message.reply_to_message.from?.id ?? "unknown"}</code>`,
        {
          reply_parameters: {
            message_id: ctx.message?.message_id,
          },
          parse_mode: "HTML",
        },
      );
      await sendEvent({
        event_type: "admin_command",
        payload: {
          command: "userinfo",
          calleeId: userId,
          requestedUserId: ctx.message.reply_to_message.from?.id ?? "unknown",
        },
      });
    } else if (action === "pay") {
      const [_userId, _amount] = args;
      if (
        !_userId ||
        !_amount ||
        isNaN(Number(_amount)) ||
        isNaN(Number(_userId))
      ) {
        await ctx.reply("Хинт: /run pay <user_id> <amount>", {
          reply_parameters: {
            message_id: ctx.message?.message_id,
          },
        });
        return;
      }

      const forUserId = Number(_userId);
      const amount = Number(_amount);

      const userState = await kv
        .get<UserState>(getUserKey(forUserId))
        .then(
          (state) =>
            state.value ??
            initUserState(
              ctx.from?.username ||
                ctx.from?.first_name ||
                `User ID: ${forUserId}`,
            ),
        );

      const nextUserState: UserState = {
        ...userState,
        coins: userState.coins + amount,
      };

      await kv.set(getUserKey(forUserId), nextUserState);

      await ctx.reply(
        `Баланс юзера ${userState.displayName} (${forUserId}) \n\
${userState.coins}${amount >= 0 ? `+${amount}` : amount} -> ${nextUserState.coins}`,
        {
          reply_parameters: {
            message_id: ctx.message?.message_id,
          },
        },
      );

      await sendEvent({
        event_type: "admin_command",
        payload: {
          command: "pay",
          calleeId: userId,
          amount,
          forUserId: forUserId,
        },
      });
    } else {
      await ctx.reply(
        "available: \n\
- usersync \n\
- userinfo (replied) \n\
- pay <user_id> <amount>",
        {
          reply_parameters: {
            message_id: ctx.message?.message_id,
          },
        },
      );
    }

    return;
  });

  bot.command("__debug", async (ctx) => {
    await ctx.reply(
      Object.entries({
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
      })
        .map(([key, value]) => `${key} : ${value}`)
        .join("\n"),
      {
        reply_to_message_id: ctx.message?.message_id,
      },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(locales.help(), {
      reply_to_message_id: ctx.update.message?.message_id,
    });
  });

  bot.command("rename", async (ctx) => {
    const id = ctx.from?.id;

    if (!id || !ADMINS.includes(id.toString())) return;

    const [oldName, newName] = ctx.message?.text?.split(" ", 3).slice(1) || [];
    if (!oldName || !newName) {
      await ctx.reply("... <old_name> <new_name/* to clear>");
      return;
    }

    if (newName === "*") {
      await kv.delete(["renames", oldName]);
      await ctx.reply(`Renaming for ${oldName} cleared`);
      return;
    }

    const key = ["renames", oldName];
    await kv.set(key, newName);

    await ctx.reply(`Renamed ${oldName} to ${newName}`);
  });

  bot.command("renames", async (ctx) => {
    const id = ctx.from?.id;

    if (!id || !ADMINS.includes(id.toString())) return;

    const renames = await collectList(["renames"]);

    await ctx.reply(`${JSON.stringify(renames, null, 2)}`);
  });

  bot.command("top", async (ctx) => {
    const users = kv.list<UserState>({ prefix: [CURRENT_KEY] });

    let limit = 15;

    if (ctx.message) {
      const [action] = stripFirst(ctx.message.text).split(/\s+/);
      if (action === "full") {
        limit = 0;
      }
    }

    type UserWithId = UserState & { id: string };

    const usersTop: UserWithId[] = [];

    const renames = Object.fromEntries(
      (await collectList(["renames"])).map(({ key, value }) => [key[1], value]),
    );

    for await (const user of users) {
      if (
        getDaysBetween(
          getCurrentDay(),
          getDateFromMillis(user.value.lastDayUtc),
        ) >= DAYS_OF_INACTIVITY_TO_HIDE_IN_TOP
      ) {
        continue;
      }
      usersTop.push({
        ...user.value,
        displayName: renames[user.value.displayName] || user.value.displayName,
        id: user.key[1].toString(),
      });
    }

    if (usersTop.length === 0) {
      await ctx.reply(
        "Опа, в топе никого! Похоже никто не крутил последнее время!",
      );
      return;
    }

    usersTop.sort((a, b) => b.coins - a.coins);

    let place = 0;
    let lastBalance = usersTop[0].coins + 1;
    let usersByPlace: [number, UserWithId[]][] = [];
    for (
      let i = 0;
      i < usersTop.length && (place < limit || limit === 0);
      i++
    ) {
      const user = usersTop[i];
      if (user.coins < lastBalance) {
        place++;
        lastBalance = user.coins;
        usersByPlace.push([usersByPlace.length + 1, []]);
      }
      usersByPlace[place - 1][1].push(user);
    }

    if (usersByPlace[0]) {
      await sendEvents(
        usersByPlace[0][1].map((user) => ({
          event_type: "achievement",
          payload: {
            type: "first_place",
            balance: user.coins,
            chat_id: ctx.chat.id,
            user_id: user.id,
            createdAt: Date.now(),
          },
        })),
      );
    }

    const topStrings = usersByPlace.map(([place, users], i) => {
      const isFirstPlace = i === 0;
      if (users.length === 1) {
        return `${place}. ${formatUserToPlace(users[0], isFirstPlace)}`;
      }
      return `${place}.\n  - ${users.map((user) => formatUserToPlace(user, isFirstPlace)).join("\n  - ")}`;
    });

    await ctx.reply(
      [
        locales.topPlayers(),
        ...topStrings,
        limit === 0 ? "" : locales.topPlayersFull(),
        locales.hiddenReminder(),
      ].join("\n"),
      {
        reply_to_message_id: ctx.update.message?.message_id,
      },
    );
  });

  bot.command("balance", async (ctx) => {
    const id = ctx.from?.id;
    if (!id) return;

    const user = await getUserStateSafe(ctx);

    const isVisible =
      user?.lastDayUtc &&
      getDaysBetween(getCurrentDay(), getDateFromMillis(user.lastDayUtc)) <
        DAYS_OF_INACTIVITY_TO_HIDE_IN_TOP;

    await ctx.reply(
      [
        locales.yourBalance(user!.coins),
        isVisible ? "" : locales.yourBalanceHidden(),
      ].join("\n"),
      {
        reply_to_message_id: ctx.update.message?.message_id,
        parse_mode: "HTML",
      },
    );
  });
};
