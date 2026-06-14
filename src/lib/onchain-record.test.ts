import { describe, expect, it } from "vitest";
import { ONCHAIN_APP, ONCHAIN_RECORD_VERSION, onchainRecord } from "./onchain-record";

describe("onchainRecord", () => {
  it("wraps a body in the shared v / app / type / …body / ts envelope", () => {
    const p = JSON.parse(onchainRecord("post", { content: "hi", author: "anon" }));
    expect(p.v).toBe(ONCHAIN_RECORD_VERSION);
    expect(p.app).toBe(ONCHAIN_APP);
    expect(p.app).toBe("bsvibes"); // stays bsvibes until the Phase-7 rename flips this one constant
    expect(p.type).toBe("post");
    expect(p.content).toBe("hi");
    expect(p.author).toBe("anon");
    expect(typeof p.ts).toBe("number");
  });

  it("orders envelope fields as v, app, type, …body, ts", () => {
    const keys = Object.keys(JSON.parse(onchainRecord("boot_split", { post_id: 1, booter: "a" })));
    expect(keys).toEqual(["v", "app", "type", "post_id", "booter", "ts"]);
  });
});
