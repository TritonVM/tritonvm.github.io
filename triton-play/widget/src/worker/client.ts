/**
 * WorkerClient — manages one dedicated Worker Execution Backend.
 *
 * Enforces the Single In-Flight Execution policy: at most one pending
 * execution at a time. Hard Cancellation is achieved by calling `terminate()`,
 * which destroys the worker immediately.
 */
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from "./protocol.js";
import workerUrl from "./executor.worker.ts?worker&url";

// Resolve the emitted worker asset against this bundle's URL.
const WORKER_URL = new URL(workerUrl, import.meta.url);

type Pending = {
  resolve: (output: string[]) => void;
  reject: (error: Error) => void;
};

export class WorkerClient {
  private readonly worker: Worker;
  private pending: Pending | null = null;

  constructor() {
    this.worker = new Worker(WORKER_URL, { type: "module" });

    this.worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const pending = this.pending;
      if (!pending) return;

      this.pending = null;
      const msg = event.data;

      if (msg.type === "result") {
        pending.resolve(msg.output);
      } else {
        pending.reject(new Error(msg.error));
      }
    };

    this.worker.onerror = (event) => {
      const pending = this.pending;
      if (!pending) return;

      this.pending = null;
      pending.reject(new Error(event.message ?? "Worker error"));
    };
  }

  /** Execute a document source. Returns the output string array on success. */
  execute(source: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker.postMessage({
        type: "run",
        source,
      } satisfies MainToWorkerMessage);
    });
  }

  /**
   * Terminate the worker immediately (Hard Cancellation).
   *
   * The pending promise (if any) is silently abandoned — the caller is
   * responsible for discarding the result.
   */
  terminate(): void {
    this.pending = null;
    this.worker.terminate();
  }
}
