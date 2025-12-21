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
  // const key = ["testing", "kv", Math.random()];
  // const tval = Math.random();
  // console.log(tval);
  // await kv.set(key, tval);
  // // console.log("set", JSON.stringify(key));
  // const current = await kv.get(key);
  // // const all = await collectList(["testing", "kv"]);
  // console.log(current, JSON.stringify(current, null, 2));

  const all = await collectList<UserState>([CURRENT_KEY]);
  const res = all.map((v) => [v.value.displayName, v.value.coins] as const);

  const majors = res.filter((v) => v[1] > 120);
  const avg = majors.reduce((a, b) => a + b[1], 0) / majors.length;
  const median = majors.sort((a, b) => a[1] - b[1])[
    Math.floor(majors.length / 2)
  ][1];
  const sum = res.reduce((a, b) => a + b[1], 0);
  // console.log(all, JSON.stringify(res, null, 2));
  console.log((sum - 100 * res.length) / 4);
}
