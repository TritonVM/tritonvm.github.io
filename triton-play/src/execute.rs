use thiserror::Error;
use triton_vm::prelude::*;

use crate::document::WidgetDocument;

/// The output of a successful widget document execution.
#[derive(Debug, Clone, Eq, PartialEq, Default)]
pub struct ExecutionOutput {
    /// Output values in the order they were written by the program.
    ///
    /// Values are the inner `u64` representations of [`BFieldElement`]s, to
    /// allow lossless round-tripping. JavaScript cannot represent these values
    /// as `number` without precision loss; they should be handled as strings.
    pub output: Vec<u64>,
}

#[derive(Debug, Error)]
pub enum ExecutionError {
    #[error("VM execution failed: {0}")]
    VmError(String),

    #[error("execution stopped after reaching max_steps={max_steps} at cycle {cycle_count}")]
    MaxStepsExceeded { max_steps: u64, cycle_count: u64 },
}

pub fn execute_widget_document(
    document: &WidgetDocument,
) -> Result<ExecutionOutput, ExecutionError> {
    let mut state = VMState::new(
        document.program.clone(),
        document.frontmatter.public_input.clone(),
        document.frontmatter.non_determinism.clone(),
    );

    while !state.halting {
        if let Some(max_steps) = document.frontmatter.max_steps {
            let cycle_count = u64::from(state.cycle_count);
            if cycle_count >= max_steps {
                return Err(ExecutionError::MaxStepsExceeded {
                    max_steps,
                    cycle_count,
                });
            }
        }

        if let Err(err) = state.step() {
            return Err(ExecutionError::VmError(
                VMError::new(err, state).to_string(),
            ));
        }
    }

    Ok(ExecutionOutput {
        output: state.public_output.into_iter().map(|e| e.value()).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::parse_widget_document;

    #[test]
    fn executes_fibonacci() {
        let document = parse_widget_document(
            r#"
            +++
            public_input = [10]
            +++
            push 0
            push 1
            read_io 1
            dup 0
            skiz
            call fib_loop
            pop 1
            write_io 1
            halt

            fib_loop:
                push -1
                add
                swap 2
                dup 1
                add
                swap 1
                swap 2
                dup 0
                skiz
                recurse
                return
        "#,
        )
        .expect("document should parse");

        let result = execute_widget_document(&document).expect("execution should succeed");
        assert_eq!(result.output, vec![89]);
    }

    #[test]
    fn execution_fails_on_invalid_program() {
        let _document = parse_widget_document("push 0\nhalt").expect("document should parse");
        // Executing `halt` with no write_io is fine. Let's trigger a panic VM error instead.
        let doc_with_read = parse_widget_document("read_io 1\nhalt").expect("should parse");
        // No public input → VM should error when trying to read
        let err = execute_widget_document(&doc_with_read);
        assert!(matches!(err, Err(ExecutionError::VmError(_))));
    }

    #[test]
    fn execution_honors_max_steps() {
        let document = parse_widget_document(
            r#"
            +++
            max_steps = 1
            +++
            push 1
            push 2
            add
            halt
        "#,
        )
        .expect("document should parse");

        let err = execute_widget_document(&document);
        assert!(matches!(
            err,
            Err(ExecutionError::MaxStepsExceeded {
                max_steps: 1,
                cycle_count: 1,
            })
        ));
    }
}
