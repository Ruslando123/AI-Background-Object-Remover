import { AppError } from "./errors.ts";
import type { JobStatus } from "./types.ts";

const transitions: Record<JobStatus, readonly JobStatus[]> = {
  draft: ["validating"],
  validating: ["queued", "failed"],
  queued: ["submitting", "cancelled"],
  submitting: ["processing", "failed"],
  processing: ["postprocessing", "completed", "failed", "cancelled"],
  postprocessing: ["completed", "failed"],
  failed: ["queued"],
  completed: [],
  cancelled: [],
  expired: [],
};

export function canTransition(current: JobStatus, next: JobStatus): boolean {
  return transitions[current].includes(next);
}

export function assertTransition(current: JobStatus, next: JobStatus): void {
  if (!canTransition(current, next)) {
    throw new AppError("INVALID_JOB_TRANSITION", {
      details: { current, next },
    });
  }
}

export function isTerminal(status: JobStatus): boolean {
  return transitions[status].length === 0;
}
