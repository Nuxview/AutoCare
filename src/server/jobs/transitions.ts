export type JobStatus =
  | "OPEN" | "DIAGNOSING" | "AWAITING_APPROVAL" | "APPROVED"
  | "IN_PROGRESS" | "QUALITY_CHECK" | "READY" | "COMPLETED" | "CANCELLED";

export const ALLOWED_STAGE_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  OPEN: ["DIAGNOSING", "IN_PROGRESS", "CANCELLED"],
  DIAGNOSING: ["AWAITING_APPROVAL", "IN_PROGRESS", "CANCELLED"],
  AWAITING_APPROVAL: ["APPROVED", "CANCELLED"],
  APPROVED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["QUALITY_CHECK", "READY", "CANCELLED"],
  QUALITY_CHECK: ["READY", "IN_PROGRESS"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * Validates whether transitioning from currentStatus to targetStatus is permitted.
 * @param currentStatus - Current status of the repair job.
 * @param targetStatus - Requested destination status.
 * @returns True if the transition is permitted, false otherwise.
 */
export function isValidJobTransition(
  currentStatus: JobStatus,
  targetStatus: JobStatus,
): boolean {
  if (currentStatus === targetStatus) {
    return true;
  }
  const permitted = ALLOWED_STAGE_TRANSITIONS[currentStatus] ?? [];
  return permitted.includes(targetStatus);
}
