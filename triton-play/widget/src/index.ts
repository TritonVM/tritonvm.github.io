/**
 * Public API surface for triton-play-widget.
 *
 * Importing this module also registers the `<triton-playground>` custom
 * element for the Custom Element Embedding surface.
 */
export type {
  ExecutionState,
  ExecutionResult,
  ExecutionError,
  TritonPlayHandle,
  TritonPlayEventMap,
  MountOptions,
} from "./types.js";

export { mountTritonPlay } from "./mount.js";

// Registering the custom element is a side effect of importing this module.
export { TritonPlaygroundElement } from "./custom-element.js";

