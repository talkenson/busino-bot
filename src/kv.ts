import { type KvKey, openKv } from "@deno/kv";
import { CURRENT_KEY, DENOKV_HOST } from "../constants.ts";
import { serialize as encodeV8, deserialize as decodeV8 } from "v8";
import type { UserState } from "./types.ts";
export const kv = await openKv(DENOKV_HOST, { encodeV8, decodeV8 });

export const collectList = async <ReturnType extends unknown>(key: KvKey) => {
  const data: { key: KvKey; value: ReturnType }[] = [];
  const _data = kv.list<ReturnType>({ prefix: key });

  for await (const entry of _data) {
    data.push({ key: entry.key, value: entry.value });
  }

  return data;
};

if (import.meta.main) {
  console.log("Testing KV...", DENOKV_HOST);

  const all = await collectList<UserState>([CURRENT_KEY]);
  const res = all.map((v) => [v.value.displayName, v.key[1]] as const);
  console.log(JSON.stringify(res));
}
