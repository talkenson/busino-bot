import { CURRENT_KEY } from "../constants";

export const withoutId = (key: string[]) => {
  return key.slice(0, -1);
};

export const getChatDataKey = (id: number) => [
  `${CURRENT_KEY}-chats`,
  "data",
  id.toString(),
]; // ChatData

export const getChatNotificationKey = (id: number) => [
  `${CURRENT_KEY}-chats`,
  "notificate",
  id.toString(),
]; // boolean

export const getChatSettingsKey = (id: number) => [
  `${CURRENT_KEY}-chats`,
  "settings",
  id.toString(),
]; // ChatSettings

if (import.meta.main) {
  console.log(getChatDataKey(1));
  console.log(withoutId(getChatDataKey(1)));
}
