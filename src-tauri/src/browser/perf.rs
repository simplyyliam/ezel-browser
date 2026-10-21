//! Measurement only (cargo feature `perf`, used by `scripts/measure-memory.ps1`; normal builds don't
//! contain this). The script can't click the window, so `EZEL_PERF_URLS` says which tabs to open at
//! startup. A perf run starts from a fresh session in its own folder (`<app data>/ezel-perf`), so
//! it never reads or overwrites the real session.

/// Set by the measure script. Unset: a normal launch.
pub const ENV: &str = "EZEL_PERF_URLS";

/// What a perf launch opens.
#[derive(Debug, PartialEq)]
pub enum PerfTabs {
  /// `""`: the first-run session as is (one home tab): "just launched".
  FirstRun,
  /// `"none"`: no tabs at all, to measure the UI alone.
  Nothing,
  /// Comma-separated URLs: the first-run tab goes, these open as temp tabs (the last one shown).
  Urls(Vec<String>),
}

/// Parses `EZEL_PERF_URLS`. Only http(s) URLs are opened; anything else is ignored.
pub fn parse(value: &str) -> PerfTabs {
  let value = value.trim();
  if value.is_empty() {
    return PerfTabs::FirstRun;
  }
  if value.eq_ignore_ascii_case("none") {
    return PerfTabs::Nothing;
  }
  let urls = value
    .split(',')
    .map(str::trim)
    .filter(|u| {
      let lower = u.to_ascii_lowercase();
      (lower.starts_with("https://") || lower.starts_with("http://")) && !u.contains(char::is_whitespace)
    })
    .map(String::from)
    .collect();
  PerfTabs::Urls(urls)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_the_three_shapes() {
    assert_eq!(parse(""), PerfTabs::FirstRun);
    assert_eq!(parse(" none "), PerfTabs::Nothing);
    assert_eq!(
      parse("https://a.test/, http://b.test ,javascript:alert(1),file:///c:/x, ftp://x"),
      PerfTabs::Urls(vec!["https://a.test/".into(), "http://b.test".into()])
    );
  }
}
