export function isDuplicateIntake(takenMedIds: readonly string[], medId: string): boolean {
  return takenMedIds.includes(medId);
}

export function canClaimBrowserTask(status: string, sidecarTaskId: string | null): boolean {
  return status === "pending_approval"
    || status === "failed"
    || (status === "approved" && !sidecarTaskId);
}

export function judgeProviderTaskParams() {
  return {
    specialty: "Internal Medicine",
    zip_code: "43215",
    max_results: 3,
  } as const;
}

export function browserProofStage(status: string): string {
  if (status === "pending_approval") return "CAREGIVER APPROVAL";
  if (status === "approved" || status === "running") return "NOVA ACT + AGENTCORE";
  if (status === "completed") return "VERIFIED RECEIPT";
  if (status === "failed") return "EXPLICIT FAILURE";
  return "STRANDS TASK";
}
