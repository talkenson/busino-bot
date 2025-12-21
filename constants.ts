export const IS_PRODUCTION = Bun.env.IS_PRODUCTION === "true";

export const BOT_TOKEN = (() => {
  const token = Bun.env.BOT_TOKEN;
  if (!token || token.length === 0) {
    console.error("No bot token found");
    process.exit(1);
  }
  return token;
})();

export const DENOKV_HOST = process.env.DENOKV_HOST ?? "http://localhost:4512";

export const CURRENT_KEY = "busino-dev";

export const ATTEMPTS_LIMIT = parseInt(Bun.env.ATTEMPTS_LIMIT || "3", 10);

export const DICE_COST = 7;
export const CASINO_DICE = "🎰";

export const FREECODE_PROB = Number(Bun.env.FREECODE_PROB ?? 0.15);

export const ADMINS = (Bun.env.ADMINS ?? "").split(",").filter((v) => v.length);
