import { describe, expect, it } from "vitest";
import { isTeamRole, isDocStaffRole } from "./staff-roles";

describe("isTeamRole", () => {
  it("admits team and super_admin", () => {
    expect(isTeamRole("team")).toBe(true);
    expect(isTeamRole("super_admin")).toBe(true);
  });

  it("refuses an assistant", () => {
    // The whole design: she sits outside is_team(), in the app exactly as she
    // does in the database. Anything gated on this stays closed to her.
    expect(isTeamRole("assistant")).toBe(false);
  });

  it("refuses clients and unknown roles", () => {
    expect(isTeamRole("client")).toBe(false);
    expect(isTeamRole("auditor")).toBe(false);
    expect(isTeamRole(null)).toBe(false);
  });
});

describe("isDocStaffRole", () => {
  it("admits the three staff roles", () => {
    for (const r of ["team", "super_admin", "assistant"]) {
      expect(isDocStaffRole(r)).toBe(true);
    }
  });

  it("refuses clients and unknown roles", () => {
    // Default-deny: a role added later is refused until someone decides here.
    expect(isDocStaffRole("client")).toBe(false);
    expect(isDocStaffRole("intern")).toBe(false);
    expect(isDocStaffRole(null)).toBe(false);
  });
});
