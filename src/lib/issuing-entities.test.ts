import { describe, expect, it } from "vitest";
import { TAFAKAH_ENTITY, resolveEntity } from "./issuing-entities";
import { getDefaultContractData } from "./sales-contract";
import type { IssuingEntity } from "@/types/issuing-entity";

describe("the built-in entity", () => {
  it("matches the seller block the contract defaults already use", () => {
    // The company was written down twice — Letterhead.tsx in title case and
    // getDefaultContractData() in uppercase — with nothing to catch a drift.
    // This is that catch.
    const { seller } = getDefaultContractData();
    expect(TAFAKAH_ENTITY.legalName).toBe(seller.company);
    expect(TAFAKAH_ENTITY.legalAddress).toBe(seller.address);
    expect(TAFAKAH_ENTITY.tel).toBe(seller.tel);
    expect(TAFAKAH_ENTITY.email).toBe(seller.email);
  });

  it("matches the bank block the contract defaults already use", () => {
    // Same reasoning: the account a buyer pays into was written down twice.
    expect(TAFAKAH_ENTITY.bank).toEqual(getDefaultContractData().bank);
  });

  it("reproduces the letterhead that shipped before entities existed", () => {
    expect(TAFAKAH_ENTITY.name).toBe("TAFAKAH Food (Shanghai) Co., Ltd.");
    expect(TAFAKAH_ENTITY.nameCn).toBe("泰福凯食品贸易（上海）有限公司");
    expect(TAFAKAH_ENTITY.addressLines).toEqual([
      "Room 116, Building 1,",
      "258-288 Youdong Road,",
      "Minhang District, Shanghai, China",
    ]);
    expect(TAFAKAH_ENTITY.logoUrl).toBe("/logo.png");
  });
});

describe("resolveEntity", () => {
  const a: IssuingEntity = { ...TAFAKAH_ENTITY, id: "a", name: "A", isDefault: false };
  const b: IssuingEntity = { ...TAFAKAH_ENTITY, id: "b", name: "B", isDefault: true };

  it("prefers the document's own choice", () => {
    expect(resolveEntity([a, b], "a").id).toBe("a");
  });

  it("falls back to the default when nothing is chosen", () => {
    expect(resolveEntity([a, b]).id).toBe("b");
  });

  it("falls back to the default when the chosen id is gone", () => {
    // An entity deleted after a contract was saved must not blank the header.
    expect(resolveEntity([a, b], "deleted").id).toBe("b");
  });

  it("never leaves a document without a letterhead", () => {
    // Query still loading, request failed, or the migration has not been run.
    expect(resolveEntity(undefined).name).toBe(TAFAKAH_ENTITY.name);
    expect(resolveEntity([]).name).toBe(TAFAKAH_ENTITY.name);
    expect(resolveEntity([a]).id).toBe("a");
  });
});
