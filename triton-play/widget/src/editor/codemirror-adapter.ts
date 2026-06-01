/**
 * CodeMirror EditorAdapter — the initial Editor Adapter implementation.
 *
 * Uses CodeMirror 6 with a basic setup (line numbers, bracket matching,
 * history, etc.). Triton assembly syntax highlighting is intentionally
 * deferred to a follow-up; the plain editor is fully functional for v1.
 */
import {
  Compartment,
  EditorState,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  ViewUpdate,
  keymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
  highlightSpecialChars,
} from "@codemirror/view";
import {
  defaultKeymap,
  historyKeymap,
  history,
} from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

import type { EditorAdapter } from "./adapter.js";
import { tritonSyntaxHighlighting } from "./triton-highlighting.js";

/** Minimal CodeMirror 6 extension set for the widget editor. */
function buildExtensions(
  onChange: (value: string) => void,
  _container: HTMLElement,
): Extension[] {
  return [
    lineNumbers(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    tritonSyntaxHighlighting(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }),
    EditorView.theme({
      "&": {
        fontFamily: "monospace",
        fontSize: "0.9em",
        minHeight: "10em",
        backgroundColor: "var(--tp-editor-bg)",
        color: "var(--tp-editor-fg)",
      },
      ".cm-scroller": {
        fontFamily: "inherit",
      },
      ".cm-content": {
        caretColor: "var(--tp-editor-cursor)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--tp-editor-gutters-bg)",
        color: "var(--tp-editor-gutters-fg)",
        borderRight: "1px solid var(--tp-border)",
      },
      ".cm-activeLine": {
        backgroundColor: "var(--tp-editor-active-line)",
      },
      ".cm-selectionBackground, ::selection": {
        backgroundColor: "var(--tp-editor-selection-bg) !important",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--tp-editor-cursor)",
      },
    }),
  ];
}

export class CodeMirrorAdapter implements EditorAdapter {
  private view: EditorView;
  private changeCallbacks: Set<(value: string) => void> = new Set();
  private readonly editableCompartment = new Compartment();
  private readonly readOnlyCompartment = new Compartment();

  constructor(container: HTMLElement, initialValue: string) {
    this.view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          this.editableCompartment.of(EditorView.editable.of(true)),
          this.readOnlyCompartment.of(EditorState.readOnly.of(false)),
          ...buildExtensions((value) => {
            this.changeCallbacks.forEach((cb) => cb(value));
          }, container),
        ],
      }),
      parent: container,
    });
  }

  getValue(): string {
    return this.view.state.doc.toString();
  }

  setValue(value: string): void {
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: value,
      },
    });
  }

  onChange(callback: (value: string) => void): void {
    this.changeCallbacks.add(callback);
  }

  setReadOnly(readonly: boolean): void {
    this.view.dispatch({
      effects: [
        this.editableCompartment.reconfigure(EditorView.editable.of(!readonly)),
        this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(readonly)),
      ],
    });
  }

  destroy(): void {
    this.view.destroy();
    this.changeCallbacks.clear();
  }
}

