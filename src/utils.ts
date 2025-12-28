import { ATTEMPTS_LIMIT } from "../constants";
import { getCurrentDay } from "./helpers";
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

function shuffleArray<T>(_array: T[]): T[] {
  let currentIndex = _array.length;

  const array = [..._array];

  while (currentIndex != 0) {
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}

export const getRandomFromArray = <Type extends unknown>(arr: Type[]) =>
  arr[Math.floor(Math.random() * arr.length)];

export const getSomeRandomFromArray = <Type extends unknown>(
  arr: Type[],
  count: number,
) => {
  const shuffled = shuffleArray([...arr]);

  const start = Math.floor(Math.random() * (arr.length - count - 1));
  const end = start + count;

  return shuffled.slice(start, end);
};

export const isMoreRollsAvailable = (user: UserState) => {
  const isCurrentDay = getCurrentDay().toMillis() === user.lastDayUtc;
  const total = ATTEMPTS_LIMIT + (user.extraAttempts || 0);
  return Math.max(0, isCurrentDay ? total - user.attemptCount : ATTEMPTS_LIMIT);
};

export const formatUserToPlace = (
  user: UserState,
  isFirstPlace: boolean = false,
) => {
  const moreRolls = isMoreRollsAvailable(user);
  return (
    `${decorateName(user.displayName, user.coins, isFirstPlace ? "👑" : undefined)} - ${user.coins}` +
    (moreRolls > 0
      ? ` (ещё ${plural(moreRolls, ["попытка", "попытки", "попыток"], true)})`
      : "")
  );
};
