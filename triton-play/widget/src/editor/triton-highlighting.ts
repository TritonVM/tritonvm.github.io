import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

type InstructionCategory =
  | "stack"
  | "control"
  | "memory"
  | "hashing"
  | "base"
  | "bitwise"
  | "extension"
  | "io"
  | "many";

const CATEGORY_BY_OPCODE: Readonly<Record<string, InstructionCategory>> = {
  // Stack Manipulation
  push: "stack",
  pop: "stack",
  divine: "stack",
  pick: "stack",
  place: "stack",
  dup: "stack",
  swap: "stack",

  // Control Flow
  halt: "control",
  nop: "control",
  skiz: "control",
  call: "control",
  return: "control",
  recurse: "control",
  recurse_or_return: "control",
  assert: "control",

  // Memory Access
  read_mem: "memory",
  write_mem: "memory",

  // Hashing
  hash: "hashing",
  assert_vector: "hashing",
  sponge_init: "hashing",
  sponge_absorb: "hashing",
  sponge_absorb_mem: "hashing",
  sponge_squeeze: "hashing",

  // Base Field Arithmetic
  add: "base",
  addi: "base",
  mul: "base",
  invert: "base",
  eq: "base",

  // Bitwise Arithmetic
  split: "bitwise",
  lt: "bitwise",
  and: "bitwise",
  xor: "bitwise",
  log_2_floor: "bitwise",
  pow: "bitwise",
  div_mod: "bitwise",
  pop_count: "bitwise",

  // Extension Field Arithmetic
  xx_add: "extension",
  xx_mul: "extension",
  x_invert: "extension",
  xb_mul: "extension",

  // Input/Output
  read_io: "io",
  write_io: "io",

  // Many-In-One
  merkle_step: "many",
  merkle_step_mem: "many",
  xx_dot_step: "many",
  xb_dot_step: "many",
};

const LABEL_DEF_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*):/;
const OPCODE_RE = /^\s*([a-z_][a-z0-9_]*)\b/;
const ARG_RE = /^\s+([^\s]+)/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DECIMAL_RE = /^-?\d+$/;

const tokenDeco = {
  comment: Decoration.mark({ class: "tp-tok-comment" }),
  labelDef: Decoration.mark({ class: "tp-tok-label-def" }),
  labelRef: Decoration.mark({ class: "tp-tok-label-ref" }),
  number: Decoration.mark({ class: "tp-tok-number" }),
  stack: Decoration.mark({ class: "tp-tok-cat-stack" }),
  control: Decoration.mark({ class: "tp-tok-cat-control" }),
  memory: Decoration.mark({ class: "tp-tok-cat-memory" }),
  hashing: Decoration.mark({ class: "tp-tok-cat-hashing" }),
  base: Decoration.mark({ class: "tp-tok-cat-base" }),
  bitwise: Decoration.mark({ class: "tp-tok-cat-bitwise" }),
  extension: Decoration.mark({ class: "tp-tok-cat-extension" }),
  io: Decoration.mark({ class: "tp-tok-cat-io" }),
  many: Decoration.mark({ class: "tp-tok-cat-many" }),
};

function categoryDecoration(category: InstructionCategory): Decoration {
  return tokenDeco[category];
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    const lines = text.split("\n");
    let lineStart = from;

    for (const lineText of lines) {
      highlightLine(builder, lineStart, lineText);
      lineStart += lineText.length + 1;
    }
  }

  return builder.finish();
}

function highlightLine(
  builder: RangeSetBuilder<Decoration>,
  lineStart: number,
  lineText: string,
): void {
  const commentOffset = lineText.indexOf("//");
  const codeText = commentOffset >= 0 ? lineText.slice(0, commentOffset) : lineText;

  // RangeSetBuilder expects ranges to be added in document order.
  // Keep comment range and add it after code tokens on this line.
  const commentStart = commentOffset >= 0 ? lineStart + commentOffset : null;
  const commentEnd = commentOffset >= 0 ? lineStart + lineText.length : null;

  // Track absolute position in the line, not relative to codeText
  let absPos = lineStart;

  // Check for label definition at the start of the line
  const labelMatch = codeText.match(LABEL_DEF_RE);
  if (labelMatch && labelMatch.index !== undefined) {
    const labelContent = labelMatch[1];
    // label content position within the match
    const labelContentOffset = labelMatch[0].indexOf(labelContent);
    const labelStart = absPos + labelMatch.index + labelContentOffset;
    const labelEnd = labelStart + labelContent.length;
    builder.add(labelStart, labelEnd, tokenDeco.labelDef);
    // Move position past the label definition
    absPos += labelMatch.index + labelMatch[0].length;
  }

  // Process all instructions on the line
  let codePos = absPos - lineStart; // Track position within codeText
  while (codePos < codeText.length) {
    const rest = codeText.slice(codePos);
    const opcodeMatch = rest.match(OPCODE_RE);
    if (!opcodeMatch || opcodeMatch.index === undefined) {
      break;
    }

    const opcode = opcodeMatch[1];
    const category = CATEGORY_BY_OPCODE[opcode];
    if (!category) {
      // Skip unrecognized opcodes
      codePos += opcodeMatch.index + opcodeMatch[0].length;
      absPos = lineStart + codePos;
      continue;
    }

    // Opcode starts at the position of the matched text plus offset to actual opcode
    const opcodeOffset = opcodeMatch.index + opcodeMatch[0].indexOf(opcode);
    const opcodeStart = lineStart + codePos + opcodeOffset;
    const opcodeEnd = opcodeStart + opcode.length;

    builder.add(opcodeStart, opcodeEnd, categoryDecoration(category));

    // Update position to after the opcode match
    codePos += opcodeMatch.index + opcodeMatch[0].length;
    absPos = lineStart + codePos;

    // Try to highlight argument
    const argsRest = codeText.slice(codePos);
    const argMatch = argsRest.match(ARG_RE);
    if (argMatch && argMatch.index !== undefined) {
      const argToken = argMatch[1];
      // Argument token starts after the matched whitespace
      const argOffset = argMatch.index + (argMatch[0].length - argToken.length);
      const argStart = lineStart + codePos + argOffset;
      const argEnd = argStart + argToken.length;

      const isCallLabelArg = opcode === "call" && IDENT_RE.test(argToken);
      const isNumericArg = DECIMAL_RE.test(argToken);

      if (isCallLabelArg) {
        builder.add(argStart, argEnd, tokenDeco.labelRef);
      } else if (isNumericArg) {
        builder.add(argStart, argEnd, tokenDeco.number);
      }

      // Only consume the token when we recognized it as this opcode's argument.
      // Otherwise it may be the next opcode on the same line.
      if (isCallLabelArg || isNumericArg) {
        codePos += argOffset + argToken.length;
        absPos = lineStart + codePos;
      }
    }
  }

  if (
    commentStart !== null
    && commentEnd !== null
    && commentStart < commentEnd
  ) {
    builder.add(commentStart, commentEnd, tokenDeco.comment);
  }
}

const tritonHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export function tritonSyntaxHighlighting(): Extension {
  return tritonHighlightPlugin;
}

