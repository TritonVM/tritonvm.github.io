use std::collections::HashMap;

use markdown_frontmatter::Error as FrontmatterError;
use serde::Deserialize;
use serde::Deserializer;
use serde::Serialize;
use serde::Serializer;
use thiserror::Error;
use triton_vm::prelude::BFieldElement;
use triton_vm::prelude::Digest;
use triton_vm::prelude::NonDeterminism;
use triton_vm::prelude::ParseError;
use triton_vm::prelude::Program;
use triton_vm::prelude::PublicInput;

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct WidgetDocument {
    pub frontmatter: WidgetFrontmatter,
    pub program: Program,
}

#[derive(Debug, Default, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WidgetFrontmatter {
    #[serde(default)]
    #[serde(serialize_with = "serialize_public_input")]
    #[serde(deserialize_with = "deserialize_public_input")]
    pub public_input: PublicInput,

    #[serde(default)]
    #[serde(deserialize_with = "deserialize_non_determinism")]
    pub non_determinism: NonDeterminism,

    pub max_steps: Option<u64>,
}

fn serialize_public_input<S>(public_input: &PublicInput, s: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    public_input.individual_tokens.serialize(s)
}

fn deserialize_public_input<'de, D>(d: D) -> Result<PublicInput, D::Error>
where
    D: Deserializer<'de>,
{
    Vec::<_>::deserialize(d).map(PublicInput::new)
}

/// TOML table keys are always strings, but `BFieldElement` deserializes from
/// `u64`. This helper struct uses `HashMap<String, BFieldElement>` for `ram`
/// so that string keys like `"0"` are accepted and then parsed as integers.
#[derive(Deserialize)]
struct NonDeterminismHelper {
    #[serde(default)]
    individual_tokens: Vec<BFieldElement>,

    #[serde(default)]
    digests: Vec<Digest>,

    #[serde(default)]
    ram: HashMap<String, BFieldElement>,
}

fn deserialize_non_determinism<'de, D>(d: D) -> Result<NonDeterminism, D::Error>
where
    D: Deserializer<'de>,
{
    let helper = NonDeterminismHelper::deserialize(d)?;
    let ram = helper
        .ram
        .into_iter()
        .map(|(k, v)| {
            let key = k.parse().map_err(serde::de::Error::custom)?;
            Ok((BFieldElement::new(key), v))
        })
        .collect::<Result<_, _>>()?;
    let non_determinism = NonDeterminism {
        individual_tokens: helper.individual_tokens,
        digests: helper.digests,
        ram,
    };

    Ok(non_determinism)
}

#[derive(Debug, PartialEq, Error)]
pub enum ParseWidgetDocumentError<'program> {
    #[error("the widget document is empty")]
    EmptyDocument,

    #[error("frontmatter opening fence was found without a closing fence")]
    MissingClosingDelimiter,

    #[error("failed to parse TOML frontmatter")]
    InvalidToml(#[source] toml::de::Error),

    #[error("failed to deserialize TOML frontmatter")]
    DeserializeToml(#[source] toml::de::Error),

    #[error("failed to parse program: {0}")]
    ProgramParseError(ParseError<'program>),
}

impl From<FrontmatterError> for ParseWidgetDocumentError<'_> {
    fn from(err: FrontmatterError) -> Self {
        match err {
            FrontmatterError::DisabledFormat(_) => unreachable!("only the `toml` feature is used"),
            FrontmatterError::AbsentClosingDelimiter(_) => Self::MissingClosingDelimiter,
            FrontmatterError::InvalidToml(e) => Self::InvalidToml(e),
            FrontmatterError::DeserializeToml(e) => Self::DeserializeToml(e),
        }
    }
}

impl<'program> From<ParseError<'program>> for ParseWidgetDocumentError<'program> {
    fn from(err: ParseError<'program>) -> Self {
        Self::ProgramParseError(err)
    }
}

pub fn parse_widget_document(source: &str) -> Result<WidgetDocument, ParseWidgetDocumentError<'_>> {
    let (frontmatter, program_source) = markdown_frontmatter::parse::<WidgetFrontmatter>(source)?;
    let program = Program::from_code(program_source)?;

    Ok(WidgetDocument {
        frontmatter,
        program,
    })
}

#[cfg(test)]
mod tests {
    use assert2::assert;
    use triton_vm::isa::instruction::Instruction;
    use triton_vm::prelude::BFieldElement;
    use triton_vm::prelude::bfe;

    use super::*;

    #[test]
    fn parses_inline_document_with_frontmatter() {
        let document = parse_widget_document(
            "
+++
public_input = [10]
max_steps = 123

[non_determinism]
individual_tokens = [1, 2]
digests = [\"00000000000000030000000000000004000000000000000500000000000000060000000000000007\"]

[non_determinism.ram]
0 = 99
+++

push 0
push 1
            ",
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
        let public_input = frontmatter.public_input;
        assert!(1 == public_input.len());
        assert!(10 == public_input[0].value());
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
            "
                push 0
                halt
            ",
        )
        .expect("document should parse");

        // assert!(document.frontmatter.public_input.is_none());

        let push_0 = Instruction::Push(bfe!(0));
        assert!(3 == document.program.instructions.len()); // includes arguments
        assert!(push_0 == document.program.instructions[0]);
        assert!(push_0 == document.program.instructions[1]);
        assert!(Instruction::Halt == document.program.instructions[2]);
    }

    #[test]
    fn rejects_unknown_keys() {
        let parse_result = parse_widget_document(
            "
+++
unexpected = 1
+++
push 0
            ",
        )
        .unwrap_err();
        assert!(matches!(
            parse_result,
            ParseWidgetDocumentError::DeserializeToml(_)
        ));
    }

    #[test]
    fn rejects_missing_closing_fence() {
        let parse_result = parse_widget_document(
            "
+++
public_input = [1]
push 0
            ",
        );
        assert!(matches!(
            parse_result,
            Err(ParseWidgetDocumentError::MissingClosingDelimiter)
        ));
    }

    #[test]
    fn parsing_preserves_internal_blank_lines() {
        let source = "\n    push 0\n    \n    push 1\n\n";
        let (_, trimmed) = markdown_frontmatter::parse::<WidgetFrontmatter>(source).unwrap();
        assert!("push 0\n    \n    push 1\n\n" == trimmed);
    }
}
