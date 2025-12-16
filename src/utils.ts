import { ATTEMPTS_LIMIT } from "../constants";
import { decorateName } from "./nameDecorators";
import type { UserState } from "./types";

export const plural = (
  number: number,
  titles: string[],
  includeNumber: boolean = false,
): string => {
  const cases = [2, 0, 1, 1, 1, 2];
  const absolute = Math.abs(number);
  const text =
    titles[
      absolute % 100 > 4 && absolute % 100 < 20
        ? 2
        : cases[absolute % 10 < 5 ? absolute % 10 : 5]
    ];
  return includeNumber ? `${number} ${text}` : text;
};

export const getSafeNumber = (x: number): { safe: boolean; value: number } => {
  if (Number.isNaN(x)) return { safe: false, value: 0 };
  if (!Number.isFinite(x)) return { safe: false, value: 0 };
  return { safe: true, value: x };
};

export const getRandomFromArray = <Type extends unknown>(arr: Type[]) =>
  arr[Math.floor(Math.random() * arr.length)];

export const isMoreRollsAvailable = (user: UserState) => {
  const total = ATTEMPTS_LIMIT + (user.extraAttempts || 0);
  return Math.max(0, total - user.attemptCount);
};

export const formatUserToPlace = (user: UserState) => {
  const moreRolls = isMoreRollsAvailable(user);
  return (
    `${decorateName(user.displayName, user.coins)} - ${user.coins}` +
    (moreRolls > 0
      ? ` (ещё ${plural(moreRolls, ["попытка", "попытки", "попыток"], true)})`
      : "")
  );
};
