import { match, P } from "ts-pattern";
import { ADMINS, CURRENT_KEY, FREECODE_PROB } from "../constants.ts";
import type { UserState } from "./types.ts";
import { createFreespinCode } from "./intents/redeemCode.ts";

import { DateTime } from "luxon";
import type { Bot, CommandContext, Context } from "grammy";
import { kv } from "./kv.ts";

export const initUserState = (displayName: string): UserState => ({
  displayName,
  coins: 100,
  lastDayUtc: getCurrentDay().toMillis(),
  attemptCount: 0,
  extraAttempts: 0,
});

export const getUserKey = (id: number) => [CURRENT_KEY, id.toString()];

export const STICKERS = ["bar", "cherry", "lemon", "seven"] as const;
export const STAKE_PRICE = [1, 1, 2, 3];

export const getMaxFrequency = (arr: number[]) => {
  const map = new Map<number, number>();

  const rolls: number[] = [];

  for (const item of arr) {
    const count = map.get(item) ?? 0;
    map.set(item, count + 1);
    rolls.push(item);
  }

  const maxVal = Math.max(...map.values());
  const maxKey =
    [...map.entries()].find(([, val]) => val === maxVal)?.[0] ?? arr[0];

  return [maxKey, maxVal, rolls] as const;
};

export const getRollsSum = (rolls: number[]) =>
  rolls.reduce((acc, v) => (acc += STAKE_PRICE[v] ?? 0), 0);

export const getPrize = (
  maxFrequent: number,
  maxFrequency: number,
  rolls: number[],
  isRedeem: boolean = false,
) =>
  isRedeem
    ? match([STICKERS[maxFrequent], maxFrequency])
        .with(["seven", 3], () => 150)
        .with(["lemon", 3], () => 70)
        .with(["cherry", 3], () => 50)
        .with(["bar", 3], () => 45)
        .with(["seven", 2], () => 30 + getRollsSum(rolls) * 4)
        .with(["lemon", 2], () => 20 + getRollsSum(rolls) * 4)
        .with([P._, 2], () => 15 + getRollsSum(rolls) * 4)
        .otherwise(() => getRollsSum(rolls))
    : match([STICKERS[maxFrequent], maxFrequency])
        .with(["seven", 3], () => 77)
        .with(["lemon", 3], () => 30)
        .with(["cherry", 3], () => 23)
        .with(["bar", 3], () => 21)
        .with(["seven", 2], () => 10 + getRollsSum(rolls))
        .with(["lemon", 2], () => 6 + getRollsSum(rolls))
        .with([P._, 2], () => 4 + getRollsSum(rolls))
        .otherwise(() => getRollsSum(rolls) - 3);

export const getFreespinCode = async (userId: number, chatId: number) => {
  if (Math.random() <= FREECODE_PROB) {
    const code = await createFreespinCode(userId, chatId);
    return code;
  }
  return undefined;
};

export const getCurrentDate = () => {
  return DateTime.now().setZone("UTC+7").set({
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
};

export { DateTime };

export const stripFirst = (str: string) => {
  if (str.split(/\s+/).length <= 1) return "";
  return str.replace(/^\S+\s+/, "").trim();
};

export const getUserStateSafe = async (ctx: CommandContext<Context>) => {
  const id = ctx.from?.id;
  if (!id) return;

  let initialized = true;
  const user = await kv.get<UserState>(getUserKey(id)).then((state) => {
    initialized = false;
    return (
      state.value ??
      initUserState(
        ctx.from?.username || ctx.from?.first_name || `User ID: ${id}`,
      )
    );
  });

  if (!initialized) {
    await kv.set(getUserKey(id), user);
  }

  return user;
};

export const getCurrentDay = () => {
  return DateTime.now().setZone("UTC+7").set({
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
};

export const getDaysBetween = (current: DateTime, last: DateTime) => {
  return Math.floor(current.diff(last, "days").days);
};

export const getDateFromMillis = (millis: number) => {
  return DateTime.fromMillis(millis).setZone("UTC+7");
};

export const isAdmin = async (
  bot: Bot,
  ctx: CommandContext<Context>,
  requireOwner = false,
) => {
  const userId = ctx.from?.id;

  if (!userId) return false;

  const chatAdmins = [];

  try {
    const chatInfo = await bot.api.getChatAdministrators(ctx.chat.id);
    chatAdmins.push(
      ...chatInfo
        .filter((user) => (requireOwner ? user.status === "creator" : true))
        .map((admin) => admin.user.id),
    );
  } catch (e) {
    console.error(e);
    return false;
  }

  if (!chatAdmins.includes(userId)) return false;

  return true;
};

if (import.meta.main) {
  let sum = 0;

  for (let i = 1; i < 65; i++) {
    const values = [0, 2, 4].map((shift) => ((i - 1) >> shift) & 0b11);
    const [maxFrequent, maxFrequency, rolls] = getMaxFrequency(values);
    const res = getPrize(maxFrequent, maxFrequency, rolls, true) - 30;
    console.log(i, values.toString(), "=", res);

    sum += res;
  }

  console.log("sum", sum, sum / 64);
}
