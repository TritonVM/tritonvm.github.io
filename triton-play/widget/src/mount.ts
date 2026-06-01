/**
 * mountTritonPlay — Mount API Embedding surface.
 *
 * Mounts a Widget Instance into `container` and returns a TritonPlayHandle
 * for host-page execution control.
 *
 * @example
 * ```ts
 * const handle = mountTritonPlay(document.querySelector('#editor'), {
 *   source: 'push 0\nhalt',
 *   on: {
 *     result: ({ output }) => console.log('output:', output),
 *     error:  ({ message }) => console.error('error:', message),
 *   },
 * });
 *
 * // later…
 * handle.run();
 * handle.destroy();
 * ```
 */
import type { MountOptions, TritonPlayHandle } from "./types.js";
import { WidgetInstance } from "./widget-instance.js";

export function mountTritonPlay(
  container: HTMLElement,
  options: MountOptions = {},
): TritonPlayHandle {
  const source = options.source ?? "";
  return new WidgetInstance(container, source, options.on ?? {});
}

