import {defineConfig} from "vite";

export default defineConfig({
    // Use relative asset URLs so the bundle is portable to any hosting path.
    // Absolute paths (the default) break worker and wasm loading when the
    // bundle is served from a subdirectory.
    base: "./",
    build: {
        lib: {
            entry: "src/index.ts",
            name: "TritonPlay",
            formats: ["es", "iife"],
            fileName: (format) => `triton-play-widget.${format}.js`,
        },
        // Ensure wasm binary is emitted as a separate asset so browsers can
        // cache it across multiple widget instances (Shared Wasm Artifact).
        assetsInlineLimit: 0,
        rollupOptions: {
            // All dependencies are bundled; the widget is self-contained.
        },
    },
    worker: {
        // Workers must be ES modules so they can use static imports
        // for the wasm-pack generated bindings.
        format: "es",
    },
    // Allow importing the generated wasm binary as a URL asset.
    assetsInclude: ["**/*.wasm"],
});

