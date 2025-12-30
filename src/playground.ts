import { bot } from "./bot";

if (import.meta.main) {
  const id = 0;
  const data = await bot.api.getChat(id);

  const admins = await bot.api.getChatAdministrators(id);

  const members = await bot.api.getChatMemberCount(id);

  console.log(data);
  console.log(admins);
  console.log(members);
}
