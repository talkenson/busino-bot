import { getSomeRandomFromArray } from "../utils";

const CAPTCHA_ITEMS: [string, string][] = [
  ["🍎", "яблоко"],
  ["🍌", "банан"],
  ["🍕", "пицца"],
  ["🚗", "машина"],
  ["🐶", "собака"],
  ["🐱", "кошка"],
  ["🎸", "гитара"],
  ["🚀", "ракета"],
  ["🍄", "гриб"],
  ["☀️", "солнце"],
  ["🔑", "ключ"],
  ["🎁", "подарок"],
  ["🌵", "кактус"],
  ["⚓️", "якорь"],
  ["🎈", "шарик"],
  ["📱", "телефон"],
  ["👓", "очки"],
  ["💎", "алмаз"],
  ["🍉", "арбуз"],
  ["🌋", "вулкан"],
  ["🧊", "ледышка"],
  ["🦉", "сова"],
  ["🐢", "черепаха"],
  ["🐝", "пчела"],
];

const pickRandomLetter = () => {
  const alphabet = "абвгдежзийклмнопрстуфхцчшщъыьюя";
  return alphabet[Math.floor(Math.random() * alphabet.length)];
};

const pickRandom = <T>(option1: T, option2: T) => {
  return Math.random() > 0.5 ? option1 : option2;
};

function corruptString(word: string): string {
  const chars = word.split("");
  const len = chars.length;

  const replacementsCount = Math.round(len / 4);

  const targetIndices = new Set<number>();

  while (targetIndices.size < replacementsCount) {
    const randomIndex = Math.floor(Math.random() * len);
    if (targetIndices.has(randomIndex)) {
      continue;
    }
    targetIndices.add(randomIndex);
  }

  return chars
    .map((char, index) =>
      targetIndices.has(index) ? pickRandom(pickRandomLetter(), "_") : char,
    )
    .join("");
}

export const createCaptcha = () => {
  const items = getSomeRandomFromArray(CAPTCHA_ITEMS, 6);
  const targetId = Math.floor(Math.random() * 100 + 1) % 6;
  const targetItem = items[targetId];

  return {
    pattern: corruptString(targetItem[1]),
    targetId: targetId,
    items: items.map(([emoji]) => emoji),
  };
};

if (import.meta.main) {
  //   CAPTCHA_ITEMS.forEach(([emoji, word]) => {
  //     console.log(`${emoji} -> ${corruptString(word)}`);
  //   });

  console.log(createCaptcha());
}
