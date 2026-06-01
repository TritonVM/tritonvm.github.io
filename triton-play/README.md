# Triton Play

Triton Play is an embeddable browser widget for editing and executing Triton VM programs within the end user's browser.

## Document Format

The initial custom-element source is the element's inner text. A document may start with TOML frontmatter (enclosed in
`+++` markers) followed by Triton assembly:

```toml
+++
public_input = [10]
max_steps = 123

[non_determinism]
individual_tokens = [1, 2]
digests = [[3, 4, 5, 6, 7]]

[non_determinism.ram]
0 = 99
+++

push 0
push 1
```

If no frontmatter is present, the entire text is treated as Triton assembly.

## Build and run

### Build the browser widget

```bash
cd packages/triton-play-widget
npm install
npm run build:wasm
npm run build:widget
```

`wasm-pack` writes the generated wasm bindings to the repo-root `wasm/` directory, and Vite bundles the widget into
`packages/triton-play-widget/dist/`.

### Run the widget demo locally

```bash
cd packages/triton-play-widget
npm run dev
```

Then open the Vite dev URL and use `index.html`, which demonstrates:

- inline custom-element embedding
- multiple widget instances on one page
- host-controlled mounting via `mountTritonPlay`

### Run browser integration tests

```bash
cd packages/triton-play-widget
npm run test:e2e
```

This command builds the wasm bindings and runs Playwright tests against the
local demo page.

## Embedding examples

### Custom element

```html

<script type="module" src="/triton-play-widget.es.js"></script>

<triton-playground>
    +++
    public_input = [10]
    +++
    push 0
    push 1
    read_io 1
</triton-playground>
```

### Mount API

```ts
import {mountTritonPlay} from "triton-play-widget";

const handle = mountTritonPlay(document.getElementById("widget")!, {
    source: "push 42\nwrite_io 1\nhalt",
    on: {
        result: ({output}) => console.log(output),
        error: ({message}) => console.error(message),
    },
});

handle.run();
```

