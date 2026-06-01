/**
 * <triton-playground> — Custom Element Embedding surface.
 *
 * Usage:
 * ```html
 * <script type="module" src="/triton-play-widget.es.js"></script>
 *
 * <triton-playground>
 * +++
 * public_input = [10]
 * +++
 * push 0
 * push 1
 * read_io 1
 * </triton-playground>
 * ```
 *
 * The element can also be controlled programmatically:
 * ```js
 * const el = document.querySelector('triton-playground');
 * el.run();
 * el.addEventListener('tp:result', e => console.log(e.detail));
 * ```
 *
 * Attributes:
 *   (none for v1 — initial document comes from element inner text)
 *
 * Events dispatched on the element:
 *   `tp:statechange`  detail: { state: ExecutionState }
 *   `tp:result`       detail: { output: string[] }
 *   `tp:error`        detail: { message: string }
 */
import type {TritonPlayEventMap} from "./types.js";
import {mountTritonPlay} from "./mount.js";
import type {TritonPlayHandle} from "./types.js";

const BLOCK_TAG_NAMES = new Set([
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "DD",
    "DIV",
    "DL",
    "DT",
    "FIELDSET",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "FORM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "HR",
    "LI",
    "MAIN",
    "NAV",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "TABLE",
    "UL",
]);

function trailingNewlineCount(chunks: string[]): number {
    let count = 0;

    for (let chunkIndex = chunks.length - 1; chunkIndex >= 0; chunkIndex -= 1) {
        const chunk = chunks[chunkIndex];
        for (let charIndex = chunk.length - 1; charIndex >= 0; charIndex -= 1) {
            if (chunk[charIndex] !== "\n") {
                return count;
            }

            count += 1;
        }
    }

    return count;
}

function ensureTrailingNewlines(chunks: string[], minimum: number): void {
    const missing = minimum - trailingNewlineCount(chunks);
    if (missing > 0) {
        chunks.push("\n".repeat(missing));
    }
}


function trimOuterBlankLines(source: string): string {
    const lines = source.split("\n");
    const start = lines.findIndex((line) => line.trim() !== "");

    if (start === -1) {
        return "";
    }

    let end = lines.length - 1;
    while (end >= start && lines[end].trim() === "") {
        end -= 1;
    }

    return lines.slice(start, end + 1).join("\n");
}

function normalizeInlineSource(source: string): string {
    const normalized = source.replace(/\r\n?/g, "\n");
    return trimOuterBlankLines(normalized);
}

function readExplicitInlineSource(element: HTMLElement): string | null {
    const attributeSource = element.getAttribute("data-tp-source");
    if (attributeSource !== null) {
        return attributeSource;
    }

    const template = element.querySelector("template[data-tp-source]");
    if (template) {
        return (template as HTMLTemplateElement).content.textContent ?? "";
    }

    const plainTextCarrier = element.querySelector(
        'script[type="text/plain"][data-tp-source], textarea[data-tp-source]',
    );
    if (plainTextCarrier) {
        return plainTextCarrier.textContent ?? "";
    }

    return null;
}

function readNodeText(node: Node, chunks: string[], depth: number): void {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";

        // Root-level whitespace text nodes are usually formatting around nested
        // markdown blocks, not user-authored program content.
        if (depth === 0 && text.trim() === "") {
            return;
        }

        chunks.push(text);
        return;
    }

    if (!(node instanceof HTMLElement)) {
        return;
    }

    if (node.tagName === "BR") {
        chunks.push("\n");
        return;
    }

    const isBlock = BLOCK_TAG_NAMES.has(node.tagName);
    if (isBlock && chunks.length > 0) {
        // Adjacent block nodes represent paragraph boundaries in markdown.
        ensureTrailingNewlines(chunks, 2);
    }

    const childStartChunkCount = chunks.length;
    for (const child of node.childNodes) {
        readNodeText(child, chunks, depth + 1);
    }

    if (isBlock) {
        if (chunks.length === childStartChunkCount) {
            // Empty blocks (e.g. <p></p>) represent an intentional blank line.
            chunks.push("\n");
            return;
        }

        ensureTrailingNewlines(chunks, 1);
    }
}

function readInlineDocumentSource(element: HTMLElement): string {
    const explicitSource = readExplicitInlineSource(element);
    if (explicitSource !== null) {
        return normalizeInlineSource(explicitSource);
    }

    const rawText = element.textContent ?? "";

    // Some hosts (notably markdown renderers) materialize child elements inside
    // <triton-playground>; traverse nodes to preserve source newlines deterministically.
    if (element.childElementCount > 0) {
        const chunks: string[] = [];
        for (const child of element.childNodes) {
            readNodeText(child, chunks, 0);
        }

        return normalizeInlineSource(chunks.join(""));
    }

    return normalizeInlineSource(rawText);
}

export class TritonPlaygroundElement extends HTMLElement {
    private handle: TritonPlayHandle | null = null;

    connectedCallback(): void {
        if (this.handle) {
            return;
        }

        const source = readInlineDocumentSource(this);

        // Clear inner text — the widget renders its own DOM inside the element.
        this.textContent = "";

        this.handle = mountTritonPlay(this, {
            source,
            on: {
                statechange: (data) =>
                    this.dispatchEvent(
                        new CustomEvent<TritonPlayEventMap["statechange"]>(
                            "tp:statechange",
                            {detail: data, bubbles: true, composed: true},
                        ),
                    ),
                result: (data) =>
                    this.dispatchEvent(
                        new CustomEvent<TritonPlayEventMap["result"]>("tp:result", {
                            detail: data,
                            bubbles: true,
                            composed: true,
                        }),
                    ),
                error: (data) =>
                    this.dispatchEvent(
                        new CustomEvent<TritonPlayEventMap["error"]>("tp:error", {
                            detail: data,
                            bubbles: true,
                            composed: true,
                        }),
                    ),
            },
        });
    }

    disconnectedCallback(): void {
        this.handle?.destroy();
        this.handle = null;
    }

    /** Host Execution Control: start (or restart) execution. */
    run(): void {
        this.handle?.run();
    }

    /** Host Execution Control: cancel the current execution. */
    cancel(): void {
        this.handle?.cancel();
    }
}

if (!customElements.get("triton-playground")) {
    customElements.define("triton-playground", TritonPlaygroundElement);
}

