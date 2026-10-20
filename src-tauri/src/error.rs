//! The one error every command returns (same pattern as Foundry): `{ code, message }`, with a stable
//! snake_case `code` the UI can match on and a human-readable `message`.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Stable, machine-readable error codes. Serialized as snake_case strings.
/// Adding a variant is an additive contract change; renaming one is not.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
  /// A bug or an unexpected state inside the backend.
  Internal,
  /// An argument was malformed or out of range (a URL that can't be parsed, non-finite bounds, a
  /// swatch slot past the grid).
  InvalidInput,
  /// The tab, folder or space an id refers to doesn't exist.
  NotFound,
  /// The action needs a pinned or swatch tab (e.g. `update_pinned_url` on a temp tab).
  NotPinned,
  /// The last space can't be deleted.
  LastSpace,
  /// No tab is shown, so there's no page to act on (`go_back`, `go_forward`, `reload`).
  NoTabShown,
  /// The native webview refused the call.
  Webview,
  /// Not available on this platform yet (most WebView2-only features outside Windows).
  Unsupported,
}

impl ErrorCode {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Internal => "internal",
      Self::InvalidInput => "invalid_input",
      Self::NotFound => "not_found",
      Self::NotPinned => "not_pinned",
      Self::LastSpace => "last_space",
      Self::NoTabShown => "no_tab_shown",
      Self::Webview => "webview",
      Self::Unsupported => "unsupported",
    }
  }
}

/// The error every command returns. Serializes to exactly `{ code, message }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AppError {
  pub code: ErrorCode,
  pub message: String,
}

impl std::fmt::Display for AppError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "{}: {}", self.code.as_str(), self.message)
  }
}

impl std::error::Error for AppError {}

impl AppError {
  pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
    Self { code, message: message.into() }
  }

  pub fn internal(message: impl Into<String>) -> Self {
    Self::new(ErrorCode::Internal, message)
  }

  pub fn invalid_input(message: impl Into<String>) -> Self {
    Self::new(ErrorCode::InvalidInput, message)
  }

  pub fn not_found(message: impl Into<String>) -> Self {
    Self::new(ErrorCode::NotFound, message)
  }
}

impl From<tauri::Error> for AppError {
  fn from(err: tauri::Error) -> Self {
    Self::new(ErrorCode::Webview, err.to_string())
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn app_error_serializes_to_exactly_code_and_message() {
    let err = AppError::not_found("tab 3 not found");
    let value = serde_json::to_value(&err).unwrap();
    assert_eq!(value, json!({ "code": "not_found", "message": "tab 3 not found" }));
    assert_eq!(value.as_object().unwrap().len(), 2);
  }

  #[test]
  fn error_code_strings_match_serde() {
    for code in [
      ErrorCode::Internal,
      ErrorCode::InvalidInput,
      ErrorCode::NotFound,
      ErrorCode::NotPinned,
      ErrorCode::LastSpace,
      ErrorCode::NoTabShown,
      ErrorCode::Webview,
      ErrorCode::Unsupported,
    ] {
      assert_eq!(serde_json::to_value(code).unwrap(), json!(code.as_str()));
    }
  }
}
