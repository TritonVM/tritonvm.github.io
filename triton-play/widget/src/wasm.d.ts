/**
 * Type declarations for the wasm-pack–generated Triton Play wasm module.
 *
 * The runtime files (`triton_play.js`, `triton_play_bg.wasm`) are generated
 * by running `npm run build:wasm` and are not committed to source control.
 *
 * This file provides enough declarations for TypeScript to type-check the
 * package without a prior wasm build.
 */
declare module "*/triton_play.js" {
  /**
   * Execute a Triton VM widget document given its source text.
   *
   * Returns a JSON string:
   * - `{"ok":true,"output":["bfe0","bfe1",...]}`  on success
   * - `{"ok":false,"error":"message"}`             on failure
   *
   * Output BFieldElement values are decimal strings to avoid JavaScript
   * `Number` precision loss.
   */
  export function execute_document(source: string): string;

  export type InitInput =
    | RequestInfo
    | URL
    | Response
    | BufferSource
    | WebAssembly.Module;

  export interface InitOutput {
    readonly memory: WebAssembly.Memory;
  }

  export default function init(
    module_or_path?: InitInput | Promise<InitInput>,
  ): Promise<InitOutput>;
}

