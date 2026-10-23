//! What Ezel says about a page's site, since a tab only shows the title the page picked: its
//! security (the lock in the titlebar peek), its origin (to clear what it stored) and the title of
//! a sign-in popup (its domain, which the page can't choose). Pure, so it's tested on its own.

use serde::Serialize;
use specta::Type;
use tauri::Url;

/// The shown page's connection, as the titlebar's lock shows it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PageSecurity {
  /// No web page (nothing shown, `about:blank`).
  #[default]
  None,
  /// HTTPS with a certificate WebView2 accepted.
  Secure,
  /// Plain HTTP: anyone on the network can read or change it. Dev tabs (localhost) included.
  NotSecure,
  /// HTTPS whose certificate couldn't be verified (WebView2 shows its warning page).
  CertificateError,
}

/// `cert_error`: WebView2 reported a certificate problem for this page's own address.
pub fn security_of(url: &str, cert_error: bool) -> PageSecurity {
  match Url::parse(url).map(|u| u.scheme().to_ascii_lowercase()).as_deref() {
    Ok("https") if cert_error => PageSecurity::CertificateError,
    Ok("https") => PageSecurity::Secure,
    Ok("http") => PageSecurity::NotSecure,
    _ => PageSecurity::None,
  }
}

/// The address's host, lowercase (`None` for anything that isn't a web page).
pub fn host_of(url: &str) -> Option<String> {
  let url = Url::parse(url).ok()?;
  if !matches!(url.scheme(), "http" | "https") {
    return None;
  }
  url.host_str().filter(|h| !h.is_empty()).map(str::to_ascii_lowercase)
}

/// `scheme://host[:port]` of a web page: what "Clear This Site's Data" clears. Built from the
/// parsed URL only, so nothing a page put in its address (paths, queries) can reach the call.
pub fn origin_of(url: &str) -> Option<String> {
  let parsed = Url::parse(url).ok()?;
  host_of(url)?;
  Some(parsed.origin().ascii_serialization())
}

/// A sign-in popup's window title: its domain first (the page can't change it), then the page's
/// own title. "accounts.example.com — Sign in". Just the domain until the page has a title.
pub fn popup_title(url: &str, title: Option<&str>) -> String {
  let host = host_of(url).unwrap_or_else(|| "Ezel".into());
  match title.map(str::trim).filter(|t| !t.is_empty()) {
    Some(title) => format!("{host} — {title}"),
    None => host,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn security_follows_the_scheme_and_certificate() {
    assert_eq!(security_of("https://example.com/a", false), PageSecurity::Secure);
    assert_eq!(security_of("HTTPS://example.com", true), PageSecurity::CertificateError);
    assert_eq!(security_of("http://example.com", false), PageSecurity::NotSecure);
    assert_eq!(security_of("http://localhost:5173/", true), PageSecurity::NotSecure, "no certificate on http");
    for url in ["about:blank", "", "blob:https://a.test/x", "not a url", "file:///C:/x"] {
      assert_eq!(security_of(url, false), PageSecurity::None, "{url}");
    }
    assert_eq!(serde_json::to_value(PageSecurity::CertificateError).unwrap(), "certificateError");
  }

  #[test]
  fn origins_are_only_scheme_host_and_port() {
    assert_eq!(origin_of("https://Example.com/path?q=1#x").as_deref(), Some("https://example.com"));
    assert_eq!(origin_of("http://localhost:5173/a").as_deref(), Some("http://localhost:5173"));
    assert_eq!(origin_of("https://a.test:443/").as_deref(), Some("https://a.test"));
    for url in ["about:blank", "file:///C:/x", "javascript:alert(1)", "data:text/html,x", "blob:https://a.test/x", ""] {
      assert_eq!(origin_of(url), None, "{url}");
    }
  }

  #[test]
  fn popup_titles_lead_with_the_domain() {
    assert_eq!(popup_title("https://accounts.example.com/signin?x=1", Some("Sign in")), "accounts.example.com — Sign in");
    assert_eq!(popup_title("https://accounts.example.com/", Some("  ")), "accounts.example.com");
    assert_eq!(popup_title("https://accounts.example.com/", None), "accounts.example.com");
    // A page that names itself after another site still shows its own domain first.
    assert_eq!(popup_title("https://evil.test/", Some("accounts.google.com")), "evil.test — accounts.google.com");
    assert_eq!(popup_title("about:blank", None), "Ezel");
  }

  #[test]
  fn hosts_are_lowercase_web_hosts() {
    assert_eq!(host_of("https://WWW.Example.COM/a").as_deref(), Some("www.example.com"));
    assert_eq!(host_of("about:blank"), None);
    assert_eq!(host_of("mailto:a@b.c"), None);
  }
}
