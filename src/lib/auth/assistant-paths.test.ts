import { describe, expect, it } from "vitest";
import { isAssistantPath } from "./assistant-paths";

describe("isAssistantPath", () => {
  it("admits the screens she works in", () => {
    for (const p of ["/", "/shipping", "/documents", "/contract-log", "/logout"]) {
      expect(isAssistantPath(p)).toBe(true);
    }
  });

  it("admits sub-paths of those screens", () => {
    expect(isAssistantPath("/shipping/SC-2026-001")).toBe(true);
    expect(isAssistantPath("/documents/upload")).toBe(true);
  });

  it("refuses everything that shows money", () => {
    // The point of the whole role. RLS denies the data too; this stops her
    // landing on a broken screen and wondering why it is empty.
    for (const p of ["/finance", "/products/calculator", "/products", "/master"]) {
      expect(isAssistantPath(p)).toBe(false);
    }
  });

  it("refuses admin, database and document-authoring screens", () => {
    for (const p of [
      "/admin/users", "/admin/super", "/admin/audit",
      "/buyers", "/sellers", "/entities", "/settings", "/setup",
      "/sales-contract", "/commercial-invoice", "/packing-list",
      "/customs-invoice", "/freight-invoice", "/schedules",
    ]) {
      expect(isAssistantPath(p)).toBe(false);
    }
  });

  it("is not fooled by a prefix that only looks allowed", () => {
    // "/shippingxyz" must not pass because it starts with "/shipping".
    expect(isAssistantPath("/shippingxyz")).toBe(false);
    expect(isAssistantPath("/documents-secret")).toBe(false);
    expect(isAssistantPath("/contract-log-finance")).toBe(false);
  });

  it("does not let the root entry admit everything", () => {
    // "/" is an exact match only — otherwise every path would start with it.
    expect(isAssistantPath("/anything")).toBe(false);
  });
});
