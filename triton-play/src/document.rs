use std::collections::HashMap;

use thiserror::Error;
use toml::Value as TomlValue;
use toml::map::Map;
use triton_vm::prelude::BFieldElement;
use triton_vm::prelude::Digest;
use triton_vm::prelude::NonDeterminism;
use triton_vm::prelude::Program;
use triton_vm::prelude::PublicInput;

const KEY_PUBLIC_INPUT: &str = "public_input";
const KEY_NON_DETERMINISM: &str = "non_determinism";
const KEY_MAX_STEPS: &str = "max_steps";

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct WidgetDocument {
    pub frontmatter: WidgetFrontmatter,
    pub program: Program,
}

#[derive(Debug, Default, Clone, Eq, PartialEq)]
pub struct WidgetFrontmatter {
    pub public_input: PublicInput,
    pub non_determinism: NonDeterminism,
    pub max_steps: Option<u64>,
}

#[derive(Debug, PartialEq, Error)]
pub enum ParseWidgetDocumentError {
    #[error("the widget document is empty")]
    EmptyDocument,

    #[error("frontmatter opening fence was found without a closing fence")]
    MissingClosingFence,

    #[error("failed to parse TOML frontmatter: {0}")]
    InvalidToml(String),

    #[error("{context} expects a TOML table")]
    ExpectedTable { context: &'static str },

    #[error("{context} expects a TOML array")]
    ExpectedArray { context: &'static str },

    #[error("{context} expects a non-negative integer")]
    ExpectedInteger { context: &'static str },

    #[error("{context} digest must contain exactly 5 elements, got {actual}")]
    InvalidDigestLength {
        context: &'static str,
        actual: usize,
    },

    #[error("{context} contains an unexpected key `{key}`")]
    UnexpectedKey { context: &'static str, key: String },

    #[error("failed to parse program: {0}")]
    ProgramParseError(String),
}

pub fn parse_widget_document(source: &str) -> Result<WidgetDocument, ParseWidgetDocumentError> {
    let normalized = normalize_text(source);
    let trimmed = trim_outer_blank_lines(&normalized);

    if trimmed.is_empty() {
        return Err(ParseWidgetDocumentError::EmptyDocument);
    }

    let (frontmatter_source, program_source) = split_frontmatter(&trimmed)?;
    let frontmatter = parse_frontmatter(frontmatter_source)?;
    let program = Program::from_code(program_source)
        .map_err(|e| ParseWidgetDocumentError::ProgramParseError(e.to_string()))?;

    Ok(WidgetDocument {
        frontmatter,
        program,
    })
}

fn split_frontmatter(source: &str) -> Result<(Option<&str>, &str), ParseWidgetDocumentError> {
    const FRONT_MATTER_START_PAT: &str = "+++\n";
    const FRONT_MATTER_END_PAT: &str = "\n+++\n";

    let Some(0) = source.find(FRONT_MATTER_START_PAT) else {
        return Ok((None, source));
    };

    let (_, source) = source.split_at(FRONT_MATTER_START_PAT.len());
    let Some(front_matter_end_index) = source.find(FRONT_MATTER_END_PAT) else {
        return Err(ParseWidgetDocumentError::MissingClosingFence);
    };

    let (frontmatter, source) = source.split_at(front_matter_end_index);
    let (_, tasm) = source.split_at(FRONT_MATTER_START_PAT.len());

    Ok((Some(frontmatter), tasm))
}

fn parse_frontmatter(
    frontmatter_source: Option<&str>,
) -> Result<WidgetFrontmatter, ParseWidgetDocumentError> {
    let Some(frontmatter_source) = frontmatter_source else {
        return Ok(WidgetFrontmatter::default());
    };
    if frontmatter_source.trim().is_empty() {
        return Ok(WidgetFrontmatter::default());
    }

    let toml_table: Map<String, TomlValue> = toml::from_str(frontmatter_source)
        .map_err(|err| ParseWidgetDocumentError::InvalidToml(err.to_string()))?;

    let public_input = parse_bfe_array(toml_table.get(KEY_PUBLIC_INPUT), KEY_PUBLIC_INPUT)?.into();
    let max_steps = parse_max_steps(toml_table.get(KEY_MAX_STEPS))?;
    let non_determinism = toml_table
        .get(KEY_NON_DETERMINISM)
        .map(parse_non_determinism)
        .transpose()?
        .unwrap_or_default();

    ensure_no_unknown_keys_in_table(
        &toml_table,
        &[KEY_PUBLIC_INPUT, KEY_NON_DETERMINISM, KEY_MAX_STEPS],
        "top-level frontmatter",
    )?;

    Ok(WidgetFrontmatter {
        public_input,
        non_determinism,
        max_steps,
    })
}

fn parse_non_determinism(value: &TomlValue) -> Result<NonDeterminism, ParseWidgetDocumentError> {
    let table = as_table(value, KEY_NON_DETERMINISM)?;

    let individual_tokens = parse_bfe_array(
        table.get("individual_tokens"),
        "non_determinism.individual_tokens",
    )?;
    let digests = parse_digests(table.get("digests"))?;
    let ram = parse_ram(table.get("ram"))?;

    ensure_no_unknown_keys_in_table(
        table,
        &["individual_tokens", "digests", "ram"],
        KEY_NON_DETERMINISM,
    )?;

    Ok(NonDeterminism {
        individual_tokens,
        digests,
        ram,
    })
}

fn parse_max_steps(value: Option<&TomlValue>) -> Result<Option<u64>, ParseWidgetDocumentError> {
    let Some(value) = value else {
        return Ok(None);
    };

    let max_steps = value
        .as_integer()
        .and_then(|i| u64::try_from(i).ok())
        .ok_or(ParseWidgetDocumentError::ExpectedInteger {
            context: KEY_MAX_STEPS,
        })?;

    Ok(Some(max_steps))
}

fn parse_bfe_array(
    value: Option<&TomlValue>,
    context: &'static str,
) -> Result<Vec<BFieldElement>, ParseWidgetDocumentError> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };

    let array = as_array(value, context)?;
    array.iter().map(|item| parse_bfe(item, context)).collect()
}

fn parse_digests(value: Option<&TomlValue>) -> Result<Vec<Digest>, ParseWidgetDocumentError> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };

    let array = as_array(value, "non_determinism.digests")?;
    array
        .iter()
        .map(|digest_value| {
            let digest_items = as_array(digest_value, "non_determinism.digests item")?;
            if digest_items.len() != Digest::LEN {
                return Err(ParseWidgetDocumentError::InvalidDigestLength {
                    context: "non_determinism.digests item",
                    actual: digest_items.len(),
                });
            }

            let parsed = digest_items
                .iter()
                .map(|item| parse_bfe(item, "non_determinism.digests item"))
                .collect::<Result<Vec<_>, _>>()?;

            let digest: [BFieldElement; Digest::LEN] = parsed
                .try_into()
                .expect("digest length is checked before conversion");
            let digest = Digest::new(digest);

            Ok(digest)
        })
        .collect()
}

fn parse_ram(
    value: Option<&TomlValue>,
) -> Result<HashMap<BFieldElement, BFieldElement>, ParseWidgetDocumentError> {
    let Some(value) = value else {
        return Ok(HashMap::new());
    };

    let table = as_table(value, "non_determinism.ram")?;

    let mut ram = HashMap::with_capacity(table.len());
    for (key_str, value) in table {
        let address = key_str.parse::<i64>().ok().map(BFieldElement::from).ok_or(
            ParseWidgetDocumentError::ExpectedInteger {
                context: "non_determinism.ram key",
            },
        )?;
        let val = parse_bfe(value, "non_determinism.ram value")?;
        ram.insert(address, val);
    }

    Ok(ram)
}

fn parse_bfe(
    value: &TomlValue,
    context: &'static str,
) -> Result<BFieldElement, ParseWidgetDocumentError> {
    value
        .as_integer()
        .map(BFieldElement::from)
        .ok_or(ParseWidgetDocumentError::ExpectedInteger { context })
}

fn as_table<'a>(
    value: &'a TomlValue,
    context: &'static str,
) -> Result<&'a Map<String, TomlValue>, ParseWidgetDocumentError> {
    value
        .as_table()
        .ok_or(ParseWidgetDocumentError::ExpectedTable { context })
}

fn as_array<'a>(
    value: &'a TomlValue,
    context: &'static str,
) -> Result<&'a [TomlValue], ParseWidgetDocumentError> {
    value
        .as_array()
        .map(|v| v.as_slice())
        .ok_or(ParseWidgetDocumentError::ExpectedArray { context })
}

fn ensure_no_unknown_keys_in_table(
    table: &Map<String, TomlValue>,
    known_keys: &[&str],
    context: &'static str,
) -> Result<(), ParseWidgetDocumentError> {
    for key in table.keys() {
        if !known_keys.contains(&key.as_str()) {
            return Err(ParseWidgetDocumentError::UnexpectedKey {
                context,
                key: key.clone(),
            });
        }
    }

    Ok(())
}

fn normalize_text(source: &str) -> String {
    source.replace("\r\n", "\n").replace('\r', "\n")
}

fn trim_outer_blank_lines(source: &str) -> String {
    let lines: Vec<&str> = source.lines().collect();
    let start = lines
        .iter()
        .position(|line| !line.trim().is_empty())
        .unwrap_or(lines.len());
    let end = lines
        .iter()
        .rposition(|line| !line.trim().is_empty())
        .map(|index| index + 1)
        .unwrap_or(start);

    if start >= end {
        return String::new();
    }

    let lines = &lines[start..end];
    let indent = lines
        .iter()
        .filter(|line| !line.trim().is_empty())
        .map(|line| leading_whitespace_width(line))
        .min()
        .unwrap_or(0);

    lines
        .iter()
        .map(|line| strip_leading_whitespace(line, indent))
        .collect::<Vec<_>>()
        .join("\n")
}

fn leading_whitespace_width(line: &str) -> usize {
    line.chars()
        .take_while(|character| character.is_whitespace())
        .count()
}

fn strip_leading_whitespace(line: &str, width: usize) -> &str {
    if width == 0 {
        return line;
    }

    let mut removed = 0usize;
    let mut byte_index = 0usize;
    for (index, character) in line.char_indices() {
        if removed == width {
            break;
        }
        if character.is_whitespace() {
            removed += 1;
            byte_index = index + character.len_utf8();
        } else {
            break;
        }
    }

    &line[byte_index..]
}

#[cfg(test)]
mod tests {
    use assert2::assert;
    use triton_vm::isa::instruction::Instruction;
    use triton_vm::prelude::bfe;

    use super::*;

    #[test]
    fn parses_inline_document_with_frontmatter() {
        let document = parse_widget_document(
            r#"
                +++
                public_input = [10]
                max_steps = 123

                [non_determinism]
                individual_tokens = [1, 2]
                digests = [[3, 4, 5, 6, 7]]

                [non_determinism.ram]
                "0" = 99
                +++

                push 0
                push 1
            "#,
        )
        .expect("document should parse");

        let program = document.program;
        let push = |x: u32| Instruction::Push(bfe!(x));
        assert!(4 == program.instructions.len()); // includes arguments
        assert!(push(0) == program.instructions[0]);
        assert!(push(0) == program.instructions[1]);
        assert!(push(1) == program.instructions[2]);
        assert!(push(1) == program.instructions[3]);

        let frontmatter = document.frontmatter;
        assert!(1 == frontmatter.public_input.len());
        assert!(10 == frontmatter.public_input[0].value());
        assert!(Some(123) == frontmatter.max_steps);

        let non_determinism = frontmatter.non_determinism;
        assert!(2 == non_determinism.individual_tokens.len());
        assert!(1 == non_determinism.digests.len());

        let ram = non_determinism.ram;
        let ram = ram.into_iter().collect::<Vec<_>>();
        assert!(1 == ram.len());
        assert!((bfe!(0), bfe!(99)) == ram[0]);
    }

    #[test]
    fn parses_documents_without_frontmatter() {
        let document = parse_widget_document(
            r#"
                push 0
                halt
            "#,
        )
        .expect("document should parse");

        assert!(document.frontmatter.public_input.is_empty());

        let push_0 = Instruction::Push(bfe!(0));
        assert!(3 == document.program.instructions.len()); // includes arguments
        assert!(push_0 == document.program.instructions[0]);
        assert!(push_0 == document.program.instructions[1]);
        assert!(Instruction::Halt == document.program.instructions[2]);
    }

    #[test]
    fn rejects_unknown_keys() {
        let parse_result = parse_widget_document(
            r#"
               +++
               unexpected = 1
               +++
               push 0
            "#,
        );
        assert!(matches!(
            parse_result,
            Err(ParseWidgetDocumentError::UnexpectedKey { .. })
        ));
    }

    #[test]
    fn rejects_missing_closing_fence() {
        let parse_result = parse_widget_document(
            r#"
                +++
                public_input = [1]
                push 0
            "#,
        );
        assert!(matches!(
            parse_result,
            Err(ParseWidgetDocumentError::MissingClosingFence)
        ));
    }

    #[test]
    fn trim_outer_blank_lines_preserves_internal_blank_lines() {
        let source = "\n    push 0\n    \n    push 1\n\n";
        let trimmed = trim_outer_blank_lines(source);
        assert!("push 0\n\npush 1" == trimmed);
    }
}
