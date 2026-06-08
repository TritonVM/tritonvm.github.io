/// Wasm-bindgen exports for the Triton Play widget.
///
/// This module is only compiled when targeting `wasm32` and exposes the
/// surface that the browser worker calls.
use wasm_bindgen::prelude::*;

use crate::document::parse_widget_document;
use crate::execute::execute_widget_document;

/// Execute a widget document given its raw source text.
///
/// Returns a JSON string in one of two shapes:
///
/// - Success: `{"ok":true,"output":["bfe0","bfe1",...]}`
/// - Failure: `{"ok":false,"error":"human-readable message"}`
///
/// [`BFieldElement`] values are serialized as **decimal strings** to avoid
/// JavaScript `Number` precision loss (values can exceed
/// `Number.MAX_SAFE_INTEGER`).
#[wasm_bindgen]
pub fn execute_document(source: &str) -> String {
    match parse_widget_document(source) {
        Err(e) => json_error(&e.to_string()),
        Ok(doc) => match execute_widget_document(doc) {
            Err(e) => json_error(&e.to_string()),
            Ok(out) => {
                let items: Vec<String> = out.output.iter().map(|v| format!("\"{v}\"")).collect();
                format!("{{\"ok\":true,\"output\":[{}]}}", items.join(","))
            }
        },
    }
}

/// Serialize a plain-text error message as a JSON failure response.
fn json_error(msg: &str) -> String {
    let escaped = msg
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r");
    format!("{{\"ok\":false,\"error\":\"{escaped}\"}}")
}
