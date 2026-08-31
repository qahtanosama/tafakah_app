import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAYMENT_TERM_ID,
  PAYMENT_TERMS,
  PAYMENT_TERM_IDS,
  composePaymentTerms,
  DEFAULT_PAYMENT_TERMS,
  paymentTermById,
} from "./payment-terms";

describe("payment term presets", () => {
  it("offers every declared id exactly once", () => {
    expect(PAYMENT_TERMS.map((t) => t.id)).toEqual([...PAYMENT_TERM_IDS]);
  });

  it("never cites a Bill of Lading", () => {
    // A B/L is a sea document. The Khorgos route moves on a CMR or a rail
    // waybill, so a preset naming a B/L would name a document that never exists.
    for (const t of PAYMENT_TERMS) {
      const all = [t.contract, ...Object.values(t.text)].join(" ");
      expect(all).not.toMatch(/bill of lading|B\/L/i);
    }
  });

  it("carries buyer wording in all three quote languages", () => {
    for (const t of PAYMENT_TERMS) {
      expect(t.text.en.trim()).not.toBe("");
      expect(t.text.ar.trim()).not.toBe("");
      expect(t.text.ru.trim()).not.toBe("");
    }
  });

  it("keeps Chinese out of buyer-facing text", () => {
    // zh is the team app's language; a buyer never sees it.
    for (const t of PAYMENT_TERMS) {
      for (const v of Object.values(t.text)) expect(v).not.toMatch(/[一-鿿]/);
    }
    expect(PAYMENT_TERMS.every((t) => t.label.zh.trim() !== "")).toBe(true);
  });

  it("offers the 30/70 after-loading terms the Russian trade uses", () => {
    const t = paymentTermById("a30l70");
    expect(t.text.en).toBe("30% advance, 70% after loading the container");
    expect(t.text.ru).toBe("30% предоплата, 70% после погрузки контейнера");
  });

  it("falls back to the default for an unknown or missing id", () => {
    expect(paymentTermById(undefined).id).toBe(DEFAULT_PAYMENT_TERM_ID);
    expect(paymentTermById("").id).toBe(DEFAULT_PAYMENT_TERM_ID);
    expect(paymentTermById("nonsense").id).toBe(DEFAULT_PAYMENT_TERM_ID);
  });

  it("leaves the contract's own two-part model untouched", () => {
    // Nothing already signed changes: composePaymentTerms still cites the B/L.
    expect(composePaymentTerms(DEFAULT_PAYMENT_TERMS)).toContain("Bill of Lading");
  });
});
