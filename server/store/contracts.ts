export interface EndSessionOptions {
  /** Override the end timestamp (used when closing abandoned sessions retroactively). */
  endedAt?: string;
  autoClosed?: boolean;
  summaryGenerated?: boolean;
}
