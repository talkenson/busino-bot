/*
10 - смерть в нищете
50 - бедность уже близко
200 - начинающий нумизмат
300 - подкопил немного
500 - одного кошелька может быть маловато
750 - папочка 🥵
1000 - местный олигарх
1500 - премиум
*/

const decorators = [
  [0, "💀"],
  [50, "🥺"],
  [100, ""],
  [120, "🏃‍♂️"],
  [200, "🐘"],
  [300, "🪙"],
  [500, "👛"],
  [750, "🍆"],
  [1000, "😎"],
  [1500, "⭐"],
] as const;

const getDecorator = (balance: number) => {
  for (let i = 1; i < decorators.length; i++) {
    if (balance < decorators[i][0]) {
      return decorators[i - 1][1];
    }
  }
  return decorators[0][1];
};

export const decorateName = (
  name: string,
  balance: number,
  customDecorator?: string,
) => {
  const decorator = customDecorator ?? getDecorator(balance);
  return `${decorator} ${name} ${decorator}`;
};
