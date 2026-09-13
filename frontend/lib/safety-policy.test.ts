import { describe, expect, it } from "vitest";
import {
  browserProofStage,
  canClaimBrowserTask,
  isDuplicateIntake,
  judgeProviderTaskParams,
} from "./safety-policy";

describe("Kinship safety policy", () => {
  it("prevents duplicate medication intake", () => {
    expect(isDuplicateIntake(["metformin-lunch"], "metformin-lunch")).toBe(true);
    expect(isDuplicateIntake(["metformin-lunch"], "lisinopril-am")).toBe(false);
  });

  it("only claims pending, failed, or retryable approvals", () => {
    expect(canClaimBrowserTask("pending_approval", null)).toBe(true);
    expect(canClaimBrowserTask("failed", null)).toBe(true);
    expect(canClaimBrowserTask("approved", null)).toBe(true);
    expect(canClaimBrowserTask("running", null)).toBe(false);
    expect(canClaimBrowserTask("approved", "nova-123")).toBe(false);
  });

  it("keeps the judge workflow bounded", () => {
    expect(judgeProviderTaskParams()).toEqual({
      specialty: "Internal Medicine",
      zip_code: "43215",
      max_results: 3,
    });
  });

  it("labels proof stages truthfully", () => {
    expect(browserProofStage("pending_approval")).toBe("CAREGIVER APPROVAL");
    expect(browserProofStage("running")).toBe("NOVA ACT + AGENTCORE");
    expect(browserProofStage("completed")).toBe("VERIFIED RECEIPT");
    expect(browserProofStage("failed")).toBe("EXPLICIT FAILURE");
  });
});
