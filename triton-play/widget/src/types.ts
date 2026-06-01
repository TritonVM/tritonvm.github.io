/**
 * The lifecycle states a Widget Instance can be in at any time.
 *
 * Transitions:
 *   idle → running (on run)
 *   running → succeeded | failed | canceled (on completion or cancel)
 *   succeeded | failed | canceled → running (on next run)
 */
export type ExecutionState =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

/** Successful execution result returned by the Triton VM. */
export interface ExecutionResult {
  /**
   * Output values in program order.
   *
   * Each value is a decimal string representing a BFieldElement inner value.
   * Use `BigInt(value)` to work with these in JavaScript without precision loss.
   */
  output: string[];
}

/** Failure information from a Triton VM execution attempt. */
export interface ExecutionError {
  /** Human-readable description of what went wrong. */
  message: string;
}

/**
 * Handle returned by `mountTritonPlay` and accessible on the custom element.
 */
export interface TritonPlayHandle {
  /**
   * Start execution of the current editor content.
   *
   * If a run is already in progress it is canceled first
   * (auto-cancel-and-restart policy).
   */
  run(): void;

  /**
   * Cancel the currently running execution.
   * Is a no-op if no execution is in progress.
   */
  cancel(): void;

  /**
   * Tear down this widget instance, releasing all resources.
   */
  destroy(): void;

  /**
   * Register a listener for a specific Execution Event.
   */
  on<K extends keyof TritonPlayEventMap>(
    event: K,
    listener: (data: TritonPlayEventMap[K]) => void,
  ): void;

  /**
   * Deregister a previously registered listener.
   */
  off<K extends keyof TritonPlayEventMap>(
    event: K,
    listener: (data: TritonPlayEventMap[K]) => void,
  ): void;
}

/** Map of all Execution Events and their payloads. */
export interface TritonPlayEventMap {
  /** Fired whenever the ExecutionState changes. */
  statechange: { state: ExecutionState };
  /** Fired when a run completes successfully. */
  result: ExecutionResult;
  /** Fired when a run fails (parse error or VM error). */
  error: ExecutionError;
}

/** Options accepted by `mountTritonPlay`. */
export interface MountOptions {
  /**
   * Initial widget document source (program preceded by optional TOML
   * frontmatter between `+++` fences).
   */
  source?: string;

  /** Callbacks for host execution control. */
  on?: Partial<{
    [K in keyof TritonPlayEventMap]: (
      data: TritonPlayEventMap[K],
    ) => void;
  }>;
}

