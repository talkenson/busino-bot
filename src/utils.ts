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

/**
 * Mulberry32 — простой и быстрый генератор псевдослучайных чисел
 * @param seed - целое число (seed)
 */
export const createSeededRandom = (seed: number) => {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export function shuffleArray<T>(_array: T[], getRandom: () => number): T[] {
  let currentIndex = _array.length;

  const array = [..._array];

  while (currentIndex != 0) {
    let randomIndex = Math.floor(getRandom() * currentIndex);
    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}

export const getRandomFromArray = <Type extends unknown>(
  arr: Type[],
  getRandom = Math.random,
) => arr[Math.floor(getRandom() * arr.length)];

export const getSomeRandomFromArray = <Type extends unknown>(
  arr: Type[],
  count: number,
  getRandom: () => number,
) => {
  const shuffled = shuffleArray([...arr], getRandom);

  const start = Math.floor(getRandom() * (arr.length - count - 1));
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

export const uuidToFloat = (uuid: string): number => {
  // Убираем дефисы и берем первые 12 символов
  const hex = uuid.replace(/-/g, "").substring(0, 12);

  // Переводим hex в десятичное число
  const intValue = parseInt(hex, 16);

  return intValue;
};
