/**
 * EditorAdapter — the narrow interface between a Widget Instance and its
 * underlying editor library.
 *
 * Implementations must be swap-in replaceable without changing any other
 * widget code.
 */
export interface EditorAdapter {
  /** Return the current document text (including frontmatter if present). */
  getValue(): string;

  /** Replace the editor content. Does not trigger `onChange`. */
  setValue(value: string): void;

  /** Register a callback fired whenever the user edits the document. */
  onChange(callback: (value: string) => void): void;

  /** Read-only mode prevents user edits (e.g. while running). */
  setReadOnly(readonly: boolean): void;

  /** Clean up all resources allocated by this adapter. */
  destroy(): void;
}

