import { CURRENT_KEY, DENOKV_HOST } from "../../constants";
import { collectList } from "../kv";
import { sendEvents } from "../report/reporter";
import type { UserState } from "../types";

export const syncUsers = async () => {
  const all = await collectList<UserState>([CURRENT_KEY]);
  const res = all.map((v) => [v.value.displayName, v.key[1]] as const);

  await sendEvents(
    res.map((v) => ({
      event_type: "user_map",
      payload: { display_name: v[0], user_id: v[1].toString() },
    })),
  );

  return res.length;
};

if (import.meta.main) {
  console.log("Syncing users... on", DENOKV_HOST);

  await syncUsers();

  console.log("synced");
}
