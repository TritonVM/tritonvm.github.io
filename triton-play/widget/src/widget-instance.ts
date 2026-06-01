/**
 * WidgetInstance — the core orchestrator for one widget.
 *
 * Coordinates:
 *  - The EditorAdapter (CodeMirror)
 *  - The WorkerClient (dedicated Worker Execution Backend)
 *  - UI state (run/cancel buttons, output panel)
 *  - Execution Events for host-page callbacks
 *
 * Policies enforced here:
 *  - Single In-Flight Execution: a new run auto-cancels any current run.
 *  - Hard Cancellation: `cancel()` terminates the worker immediately.
 *  - Implicit Freshness: no stale badges or auto-clear on edits.
 */
import type { EditorAdapter } from "./editor/adapter.js";
import type {
  ExecutionState,
  ExecutionResult,
  ExecutionError,
  TritonPlayEventMap,
  TritonPlayHandle,
} from "./types.js";
import { CodeMirrorAdapter } from "./editor/codemirror-adapter.js";
import { createAdaptiveThemeController } from "./theme.js";
import { WorkerClient } from "./worker/client.js";
import { ensureStylesInjected } from "./ui/styles.js";
import type { ThemeController } from "./theme.js";

type Listeners = {
  [K in keyof TritonPlayEventMap]: Set<
    (data: TritonPlayEventMap[K]) => void
  >;
};

export class WidgetInstance implements TritonPlayHandle {
  private readonly editor: EditorAdapter;
  private readonly editorContainer: HTMLElement;
  private readonly runButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly statusEl: HTMLElement;
  private readonly outputEl: HTMLElement;
  private readonly outputContentEl: HTMLPreElement;
  private readonly themeController: ThemeController;

  private worker: WorkerClient | null = null;
  private state: ExecutionState = "idle";
  private readonly listeners: Listeners = {
    statechange: new Set(),
    result: new Set(),
    error: new Set(),
  };

  constructor(
    container: HTMLElement,
    initialSource: string,
    hostCallbacks: Partial<{
      [K in keyof TritonPlayEventMap]: (
        data: TritonPlayEventMap[K],
      ) => void;
    }> = {},
  ) {
    ensureStylesInjected();

    // ── DOM structure ──────────────────────────────────────────────────────
    container.innerHTML = "";
    container.classList.add("tp-widget");
    this.themeController = createAdaptiveThemeController(container);

    const toolbar = document.createElement("div");
    toolbar.className = "tp-toolbar";

    this.runButton = document.createElement("button");
    this.runButton.className = "tp-btn tp-btn-run";
    this.runButton.textContent = "▶ Run";
    this.runButton.addEventListener("click", () => this.run());

    this.cancelButton = document.createElement("button");
    this.cancelButton.className = "tp-btn tp-btn-cancel";
    this.cancelButton.textContent = "✕ Cancel";
    this.cancelButton.disabled = true;
    this.cancelButton.addEventListener("click", () => this.cancel());

    this.statusEl = document.createElement("span");
    this.statusEl.className = "tp-status";

    toolbar.append(this.runButton, this.cancelButton, this.statusEl);

    this.editorContainer = document.createElement("div");
    this.editorContainer.className = "tp-editor-container";

    this.outputEl = document.createElement("div");
    this.outputEl.className = "tp-output tp-empty";
    this.outputContentEl = document.createElement("pre");
    this.outputContentEl.className = "tp-output-content";
    this.outputContentEl.textContent = "No output yet.";
    this.outputEl.append(this.outputContentEl);

    container.append(toolbar, this.editorContainer, this.outputEl);

    // ── Keyboard Event Capture ────────────────────────────────────────────
    // Prevent keyboard events from bubbling to parent page (e.g., mdbook).
    // This ensures the editor can handle all keyboard input without interference.
    const stopKeyboardPropagation = (e: KeyboardEvent) => {
      e.stopPropagation();
    };

    this.editorContainer.addEventListener("keydown", stopKeyboardPropagation);
    this.editorContainer.addEventListener("keyup", stopKeyboardPropagation);
    this.editorContainer.addEventListener("keypress", stopKeyboardPropagation);

    // ── Editor ─────────────────────────────────────────────────────────────
    this.editor = new CodeMirrorAdapter(this.editorContainer, initialSource);

    // Register host callbacks
    for (const [event, cb] of Object.entries(hostCallbacks) as [
      keyof TritonPlayEventMap,
      (data: never) => void,
    ][]) {
      if (cb) this.on(event, cb as never);
    }
  }

  // ── TritonPlayHandle API ─────────────────────────────────────────────────

  run(): void {
    // Auto-cancel-and-restart if already running.
    if (this.state === "running") {
      this.terminateWorker();
    }

    this.setState("running");
    this.editor.setReadOnly(true);
    this.setOutput("running", "Running…");

    const source = this.editor.getValue();
    const worker = new WorkerClient();
    this.worker = worker;

    worker
      .execute(source)
      .then((output) => {
        // Guard: if this promise resolves after a cancel, ignore it.
        if (this.worker !== worker) return;
        this.worker = null;

        const result: ExecutionResult = { output };
        this.setState("succeeded");
        this.editor.setReadOnly(false);
        this.showResult(result);
        this.emit("result", result);
      })
      .catch((e: Error) => {
        if (this.worker !== worker) return;
        this.worker = null;

        const err: ExecutionError = { message: e.message };
        this.setState("failed");
        this.editor.setReadOnly(false);
        this.showError(err);
        this.emit("error", err);
      });
  }

  cancel(): void {
    if (this.state !== "running") return;
    this.terminateWorker();
    this.setState("canceled");
    this.editor.setReadOnly(false);
    this.setOutput("", "Canceled.");
  }

  destroy(): void {
    this.terminateWorker();
    this.themeController.destroy();
    this.editor.destroy();
    this.listeners.statechange.clear();
    this.listeners.result.clear();
    this.listeners.error.clear();
  }

  on<K extends keyof TritonPlayEventMap>(
    event: K,
    listener: (data: TritonPlayEventMap[K]) => void,
  ): void {
    (this.listeners[event] as Set<(data: TritonPlayEventMap[K]) => void>).add(
      listener,
    );
  }

  off<K extends keyof TritonPlayEventMap>(
    event: K,
    listener: (data: TritonPlayEventMap[K]) => void,
  ): void {
    (
      this.listeners[event] as Set<(data: TritonPlayEventMap[K]) => void>
    ).delete(listener);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private terminateWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private setState(state: ExecutionState): void {
    this.state = state;

    const running = state === "running";
    this.runButton.disabled = running;
    this.cancelButton.disabled = !running;
    this.statusEl.textContent =
      state === "idle"
        ? ""
        : state === "running"
          ? "Running…"
          : state === "succeeded"
            ? "✓ Done"
            : state === "failed"
              ? "✗ Error"
              : "Canceled";

    this.emit("statechange", { state });
  }

  private showResult(result: ExecutionResult): void {
    if (result.output.length === 0) {
      this.setOutput("tp-success", "(no output)");
    } else {
      this.setOutput("tp-success", result.output.join("\n"));
    }
  }

  private showError(err: ExecutionError): void {
    this.setOutput("tp-error", err.message);
  }

  private setOutput(extraClass: string, text: string): void {
    this.outputEl.className =
      "tp-output" + (extraClass ? ` ${extraClass}` : "");
    this.outputContentEl.textContent = text;
  }

  private emit<K extends keyof TritonPlayEventMap>(
    event: K,
    data: TritonPlayEventMap[K],
  ): void {
    (
      this.listeners[event] as Set<(data: TritonPlayEventMap[K]) => void>
    ).forEach((fn) => fn(data));
  }
}

