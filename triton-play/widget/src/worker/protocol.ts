/**
 * Worker ↔ main thread message protocol.
 *
 * A Widget Instance (main thread) communicates with its dedicated Worker
 * Execution Backend via this typed message protocol.
 *
 * Lifecycle:
 *   main → worker: RunMessage   (start an execution)
 *   worker → main: ResultMessage | ErrorMessage   (execution outcome)
 *
 * Cancellation is performed by terminating the worker (Hard Cancellation).
 * No protocol message is needed for cancel; the worker is simply destroyed.
 */

// ── main → worker ──────────────────────────────────────────────────────────

/** Execute a widget document source text. */
export interface RunMessage {
  type: "run";
  /** The complete, raw widget document source (frontmatter + program). */
  source: string;
}

export type MainToWorkerMessage = RunMessage;

// ── worker → main ──────────────────────────────────────────────────────────

/** Successful execution. */
export interface ResultMessage {
  type: "result";
  /**
   * Output values as decimal strings (BFieldElement inner u64 values).
   * Use `BigInt(value)` in JavaScript to work with them without precision loss.
   */
  output: string[];
}

/** Failed execution (parse error or VM error). */
export interface ErrorMessage {
  type: "error";
  /** Human-readable error message. */
  error: string;
}

export type WorkerToMainMessage = ResultMessage | ErrorMessage;

