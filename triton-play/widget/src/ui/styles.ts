/** Widget UI styles, injected once into the document head. */
const STYLES = `
.tp-widget {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--tp-border);
  border-radius: 4px;
  overflow: hidden;
  font-family: sans-serif;
  font-size: 14px;
  background: var(--tp-widget-bg);
  color: var(--tp-widget-fg);
  color-scheme: var(--tp-color-scheme);

  --tp-widget-bg: #ffffff;
  --tp-widget-fg: #1f2328;
  --tp-border: #d0d7de;
  --tp-toolbar-bg: #f6f8fa;
  --tp-toolbar-fg: #1f2328;
  --tp-button-bg: #ffffff;
  --tp-button-fg: #1f2328;
  --tp-button-hover-bg: #eaeef2;
  --tp-success-fg: #0969da;
  --tp-error-fg: #b42318;
  --tp-running-fg: #57606a;
  --tp-empty-fg: #8c959f;
  --tp-output-bg: #f6f8fa;
  --tp-output-fg: #1f2328;
  --tp-editor-bg: #ffffff;
  --tp-editor-fg: #1f2328;
  --tp-editor-gutters-bg: #f6f8fa;
  --tp-editor-gutters-fg: #57606a;
  --tp-editor-selection-bg: rgba(9, 105, 218, 0.24);
  --tp-editor-active-line: rgba(208, 215, 222, 0.4);
  --tp-editor-cursor: #1f2328;
  --tp-token-comment: #6e7781;
  --tp-token-label-def: #8250df;
  --tp-token-label-ref: #0550ae;
  --tp-token-number: #0a3069;
  --tp-token-op: #1f2328;
  --tp-token-stack: #0a3069;
  --tp-token-memory: #1a7f37;
  --tp-token-hashing: #0550ae;
  --tp-token-base: #7a2e00;
  --tp-token-control: #a4371a;
  --tp-token-bitwise: #5a32a3;
  --tp-token-extension: #6f42c1;
  --tp-token-io: #0969da;
  --tp-token-many: #bc4c00;
  --tp-color-scheme: light;
}

.tp-widget[data-tp-theme="dark"] {
  --tp-widget-bg: #0d1117;
  --tp-widget-fg: #c9d1d9;
  --tp-border: #30363d;
  --tp-toolbar-bg: #161b22;
  --tp-toolbar-fg: #c9d1d9;
  --tp-button-bg: #21262d;
  --tp-button-fg: #c9d1d9;
  --tp-button-hover-bg: #30363d;
  --tp-success-fg: #3fb950;
  --tp-error-fg: #f85149;
  --tp-running-fg: #8b949e;
  --tp-empty-fg: #8b949e;
  --tp-output-bg: #161b22;
  --tp-output-fg: #c9d1d9;
  --tp-editor-bg: #0d1117;
  --tp-editor-fg: #c9d1d9;
  --tp-editor-gutters-bg: #161b22;
  --tp-editor-gutters-fg: #8b949e;
  --tp-editor-selection-bg: rgba(88, 166, 255, 0.24);
  --tp-editor-active-line: rgba(139, 148, 158, 0.16);
  --tp-editor-cursor: #c9d1d9;
  --tp-token-comment: #8b949e;
  --tp-token-label-def: #d2a8ff;
  --tp-token-label-ref: #79c0ff;
  --tp-token-number: #a5d6ff;
  --tp-token-op: #c9d1d9;
  --tp-token-stack: #a5d6ff;
  --tp-token-memory: #7ee787;
  --tp-token-hashing: #79c0ff;
  --tp-token-base: #ffa657;
  --tp-token-control: #ff7043;
  --tp-token-bitwise: #d2a8ff;
  --tp-token-extension: #d2a8ff;
  --tp-token-io: #79c0ff;
  --tp-token-many: #ffa657;
  --tp-color-scheme: dark;
}

.tp-editor-container {
  flex: 1;
  min-height: 10em;
  overflow: auto;
  border-bottom: 1px solid var(--tp-border);
  background: var(--tp-editor-bg);
}

/* CodeMirror host */
.tp-editor-container .cm-editor {
  height: 100%;
}
.tp-editor-container .cm-scroller {
  overflow: auto;
}

.tp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--tp-toolbar-bg);
  color: var(--tp-toolbar-fg);
  border-bottom: 1px solid var(--tp-border);
}

.tp-btn {
  padding: 4px 14px;
  border: 1px solid var(--tp-border);
  border-radius: 3px;
  cursor: pointer;
  background: var(--tp-button-bg);
  color: var(--tp-button-fg);
  font-size: 13px;
}
.tp-btn:hover:not(:disabled) { background: var(--tp-button-hover-bg); }
.tp-btn:disabled { opacity: 0.45; cursor: default; }

.tp-btn-run   { color: var(--tp-success-fg); }
.tp-btn-cancel{ color: var(--tp-error-fg); }

.tp-status {
  margin-left: auto;
  font-size: 12px;
  color: var(--tp-running-fg);
}

.tp-output {
  padding: 8px 12px;
  min-height: 2em;
  overflow-x: auto;
  background: var(--tp-output-bg);
  color: var(--tp-output-fg);
  border-top: 1px solid var(--tp-border);
}

.tp-output-content {
  min-width: 107ch;
  margin: 0;
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 0.9em;
}

.tp-output.tp-success { color: var(--tp-success-fg); }
.tp-output.tp-error   { color: var(--tp-error-fg); }
.tp-output.tp-running { color: var(--tp-running-fg); font-style: italic; }
.tp-output.tp-empty   { color: var(--tp-empty-fg); font-style: italic; }

/* Triton assembly token styles */
.tp-editor-container .cm-content .tp-tok-comment {
  color: var(--tp-token-comment);
}

.tp-editor-container .cm-content .tp-tok-label-def {
  color: var(--tp-token-label-def);
  font-weight: 600;
}

.tp-editor-container .cm-content .tp-tok-label-ref {
  color: var(--tp-token-label-ref);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.tp-editor-container .cm-content .tp-tok-number {
  color: var(--tp-token-number);
}

.tp-editor-container .cm-content .tp-tok-cat-stack {
  color: var(--tp-token-stack);
  font-weight: 550;
}

.tp-editor-container .cm-content .tp-tok-cat-control {
  color: var(--tp-token-control);
  font-weight: 550;
  font-style: italic;
}

.tp-editor-container .cm-content .tp-tok-cat-memory {
  color: var(--tp-token-memory);
  font-weight: 550;
}

.tp-editor-container .cm-content .tp-tok-cat-hashing {
  color: var(--tp-token-hashing);
  font-weight: 550;
}

.tp-editor-container .cm-content .tp-tok-cat-base {
  color: var(--tp-token-base);
  font-weight: 550;
}

.tp-editor-container .cm-content .tp-tok-cat-bitwise {
  color: var(--tp-token-bitwise);
  font-weight: 550;
}

.tp-editor-container .cm-content .tp-tok-cat-extension {
  color: var(--tp-token-extension);
  font-weight: 550;
}

.tp-editor-container .cm-content .tp-tok-cat-io {
  color: var(--tp-token-io);
  font-weight: 550;
}

.tp-editor-container .cm-content .tp-tok-cat-many {
  color: var(--tp-token-many);
  font-weight: 550;
}
`;

let stylesInjected = false;

export function ensureStylesInjected(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.appendChild(style);
}

