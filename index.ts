import { webhookCallback } from "grammy";
import { ADMINS, CURRENT_KEY, IS_PRODUCTION } from "./constants.ts";
import { logStart } from "./src/general.ts";
import { bot } from "./src/bot.ts";
import { locales } from "./src/locales.ts";
import dice from "./src/intents/dice.ts";
import redeemCode from "./src/intents/redeemCode.ts";
import horses from "./src/intents/horses.ts";
import { getUserStateSafe } from "./src/helpers.ts";
import { collectList, kv } from "./src/kv.ts";
import type { UserState } from "./src/types.ts";
import { formatUserToPlace } from "./src/utils.ts";
import { sendEvents } from "./src/report/reporter.ts";

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

// init
dice(bot);
redeemCode(bot);
horses(bot);
// init end

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
  const users = await kv.list<UserState>({ prefix: [CURRENT_KEY] });

  type UserWithId = UserState & { id: string };

  const usersTop: UserWithId[] = [];

  const renames = Object.fromEntries(
    (await collectList(["renames"])).map(({ key, value }) => [key[1], value]),
  );

  for await (const user of users) {
    usersTop.push({
      ...user.value,
      displayName: renames[user.value.displayName] || user.value.displayName,
      id: user.key[1].toString(),
    });
  }

  usersTop.sort((a, b) => b.coins - a.coins);

  let place = 0;
  let lastBalance = usersTop[0].coins + 1;
  let usersByPlace: [number, UserWithId[]][] = [];
  for (let i = 0; i < usersTop.length && place < 20; i++) {
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

  await ctx.reply([locales.topPlayers(), ...topStrings].join("\n"), {
    reply_to_message_id: ctx.update.message?.message_id,
  });
});

bot.command("balance", async (ctx) => {
  const id = ctx.from?.id;
  if (!id) return;

  const user = await getUserStateSafe(ctx);

  await ctx.reply(locales.yourBalance(user!.coins), {
    reply_to_message_id: ctx.update.message?.message_id,
    parse_mode: "HTML",
  });
});

bot.errorHandler = (error) => {
  console.error("Error happened: ", error);
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
