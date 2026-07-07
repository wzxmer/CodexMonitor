import { describe, expect, it } from "vitest";
import { validateBranchName } from "./branchValidation";

describe("validateBranchName", () => {
  it("returns null for valid names", () => {
    expect(validateBranchName("feature/add-login")).toBeNull();
    expect(validateBranchName(" release/v1 ")).toBeNull();
  });

  it("rejects invalid names", () => {
    expect(validateBranchName(".")).toContain("不能是 '.' 或 '..'");
    expect(validateBranchName("hello world")).toContain("不能包含空格");
    expect(validateBranchName("feature//oops")).toContain("不能包含 '//'");
    expect(validateBranchName("feature..oops")).toContain("不能包含 '..'");
    expect(validateBranchName("topic@{x")).toContain("不能包含 '@{'");
  });
});
