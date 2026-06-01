/// <reference types="vite/client" />

// Explicit declaration for worker-side wasm URL imports.
declare module "*.wasm?url" {
  const url: string;
  export default url;
}

