pub mod document;
pub mod execute;

#[cfg(target_arch = "wasm32")]
mod wasm;

pub use document::ParseWidgetDocumentError;
pub use document::WidgetDocument;
pub use document::WidgetFrontmatter;
pub use document::parse_widget_document;
pub use execute::ExecutionError;
pub use execute::ExecutionOutput;
pub use execute::execute_widget_document;
