//! Which addresses a content tab may load: web pages (`http`, `https`) and `about:blank`, nothing
//! else. Websites are hostile: `file:` would let a page (or a pasted link) open local files,
//! `javascript:` and `data:` run or render code outside any site's origin rules. One rule, checked
//! wherever an address can reach a tab: typed input (`resolve_input`), every navigation the page
//! starts (`on_navigation`), links and popups opening new windows, restored sessions and pinned
//! URLs. Pure, so it's tested on its own.

/// True for the addresses a content tab may load.
pub fn is_allowed(url: &str) -> bool {
  let lower = url.trim().to_ascii_lowercase();
  lower.starts_with("http://") || lower.starts_with("https://") || lower == "about:blank"
}

/// Schemes refused outright when typed (rather than searched for): they name a local file or
/// carry code. Other `word:` input that isn't a web address is simply searched.
pub fn is_blocked_scheme(input: &str) -> bool {
  let lower = input.trim().to_ascii_lowercase();
  ["file:", "javascript:", "data:", "vbscript:", "blob:"].iter().any(|s| lower.starts_with(s))
    || (lower.starts_with("about:") && lower != "about:blank")
}

/// What a tab opens when its saved address isn't allowed (a session from an older build).
pub const FALLBACK: &str = "about:blank";

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_web_pages_and_about_blank_are_allowed() {
    for url in ["https://example.com/", "http://localhost:5173/", "HTTPS://Example.com", "about:blank", "  about:blank "] {
      assert!(is_allowed(url), "{url}");
    }
    for url in [
      "file:///C:/Windows/win.ini",
      "FILE://server/share",
      "javascript:alert(1)",
      " JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "blob:https://example.com/uuid",
      "about:settings",
      "about:blank#x",
      "edge://settings",
      "chrome://version",
      "mailto:a@b.c",
      "",
    ] {
      assert!(!is_allowed(url), "{url}");
    }
  }

  #[test]
  fn typed_local_and_code_schemes_are_refused() {
    for input in ["file:///C:/x", "javascript:alert(1)", "data:text/html,x", "about:config", "Blob:x"] {
      assert!(is_blocked_scheme(input), "{input}");
    }
    for input in ["about:blank", "https://a.test", "localhost:5173", "rust borrow checker", "mailto:a@b.c"] {
      assert!(!is_blocked_scheme(input), "{input}");
    }
  }
}
