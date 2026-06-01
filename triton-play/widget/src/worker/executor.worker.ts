/**
 * Executor Web Worker.
 *
 * Runs entirely off the UI thread. Loads the Triton Play wasm module on first
 * use (lazy) and delegates execution to the wasm `execute_document` export.
 *
 * The wasm binary URL is resolved relative to this worker bundle at build
 * time by Vite, ensuring all Widget Instances share the same Shared Wasm
 * Artifact URL and benefit from browser HTTP caching.
 */
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from "./protocol.js";
import init, { execute_document } from "../../wasm/triton_play.js";
import wasmUrl from "../../wasm/triton_play_bg.wasm?url";

/** Promise that resolves once the wasm module is initialized. */
let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = init(wasmUrl).then(() => undefined);
  }
  return initPromise;
}

self.onmessage = async (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data;

  if (msg.type === "run") {
    try {
      await ensureInitialized();
      const jsonResult = execute_document(msg.source);
      const result = JSON.parse(jsonResult) as
        | { ok: true; output: string[] }
        | { ok: false; error: string };

      if (result.ok) {
        self.postMessage({
          type: "result",
          output: result.output,
        } satisfies WorkerToMainMessage);
      } else {
        self.postMessage({
          type: "error",
          error: result.error,
        } satisfies WorkerToMainMessage);
      }
    } catch (e) {
      self.postMessage({
        type: "error",
        error: String(e),
      } satisfies WorkerToMainMessage);
    }
  }
};

