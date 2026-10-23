//! Measurement only (cargo feature `perf`, used by `scripts/measure-memory.ps1`; normal builds don't
//! contain this). The script can't click the window, so `EZEL_PERF_URLS` says which tabs to open at
//! startup. A perf run starts from a fresh session in its own folder (`<app data>/ezel-perf`), so
//! it never reads or overwrites the real session.
//!
//! `EZEL_PERF_URLS=seed` builds a big imported-looking session instead (docs/perf/many-tabs.md), and
//! perf builds note every event's and session save's size and time on stderr (`note`): names and
//! numbers only, never URLs or content. They also open WebView2's remote debugging port
//! (`BROWSER_ARGS` in lib.rs) so `scripts/measure-many-tabs.mjs` can drive and time the UI.

use std::time::Instant;

use super::model::{Id, Model, Result, Session, TabLocation, SWATCH_SLOTS};

/// Set by the measure script. Unset: a normal launch.
pub const ENV: &str = "EZEL_PERF_URLS";

/// What a perf launch opens.
#[derive(Debug, PartialEq)]
pub enum PerfTabs {
  /// `""`: the first-run session as is (one home tab): "just launched".
  FirstRun,
  /// `"none"`: no tabs at all, to measure the UI alone.
  Nothing,
  /// `"seed"`: [`seed`]'s ~130 tabs, 4 of them loaded.
  Seed,
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
  if value.eq_ignore_ascii_case("seed") {
    return PerfTabs::Seed;
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

/// Inline (`data:`) favicon lengths, in bytes, of a real 131-tab session imported from Zen
/// (2026-10-23), smallest first. Only the lengths were kept; the seed's icons are filler.
const SEED_FAVICON_SIZES: [usize; 121] = [
  246, 322, 442, 502, 538, 674, 690, 726, 730, 734, 734, 750,
  750, 750, 750, 754, 802, 814, 1046, 1154, 1154, 1222, 1226, 1286,
  1286, 1286, 1286, 1286, 1286, 1286, 1286, 1286, 1302, 1302, 1302, 1302,
  1406, 1554, 1829, 1874, 1874, 1874, 1942, 1954, 2018, 2066, 2074, 2150,
  2150, 2150, 2150, 2150, 2174, 2422, 2654, 2722, 3181, 3181, 3246, 3290,
  3290, 3290, 3290, 3290, 3290, 3438, 3438, 3438, 3438, 3438, 3526, 3721,
  3882, 4054, 4054, 4054, 4158, 4210, 4685, 4873, 4873, 5853, 5870, 6038,
  6766, 6766, 6766, 6766, 6961, 7953, 8698, 9142, 9577, 9901, 9933, 11266,
  12853, 18662, 18753, 18753, 28914, 33022, 37086, 37086, 38870, 56218, 60602, 62974,
  68782, 72398, 90813, 109774, 109774, 131850, 231526, 237838, 237838, 237838, 317186, 363590,
  26004354,
];

/// Spaces in the seed (the first-run one included); each holds `SEED_PINNED` pinned tabs,
/// `SEED_FOLDERS` folders of `SEED_FOLDER_TABS` and `SEED_TEMP` temp tabs, plus 11 Swatches:
/// 6 x 20 + 11 = 131 tabs, like the session it copies.
const SEED_SPACES: usize = 6;
const SEED_PINNED: usize = 6;
const SEED_FOLDERS: usize = 2;
const SEED_FOLDER_TABS: usize = 4;
const SEED_TEMP: usize = 6;
const SEED_SWATCHES: usize = 11;
/// Tabs the seed loads (the rest stay unloaded, as after an import).
pub const SEED_LOADED: usize = 4;

/// Fills `model` with the seed: every tab unloaded at `https://example.com/?seed=<n>`, 121 of them
/// with a filler `data:` favicon of a real length (shuffled so the big ones land in different
/// spaces). Returns the active space's first temp tabs to load.
pub fn seed(model: &mut Model, now: u64) -> Result<Vec<Id>> {
  let mut n = 0;
  let mut next = || {
    let favicon = (n < SEED_FAVICON_SIZES.len()).then(|| {
      let size = SEED_FAVICON_SIZES[(n * 37) % SEED_FAVICON_SIZES.len()];
      let prefix = "data:image/png;base64,";
      format!("{prefix}{}", "A".repeat(size.saturating_sub(prefix.len())))
    });
    n += 1;
    (format!("https://example.com/?seed={n}"), Some(format!("Seed tab {n}")), favicon)
  };
  let first = model.session.active_space;
  let mut spaces = vec![first];
  for i in 1..SEED_SPACES {
    spaces.push(model.create_space(format!("Space {}", i + 1), "Layers".into()));
  }
  for slot in 0..SEED_SWATCHES.min(SWATCH_SLOTS) {
    let (url, title, favicon) = next();
    model.add_tab(url, title, favicon, TabLocation::Swatch { slot }, now)?;
  }
  let mut load = vec![];
  for &space_id in &spaces {
    for _ in 0..SEED_PINNED {
      let (url, title, favicon) = next();
      model.add_tab(url, title, favicon, TabLocation::Pinned { space_id, folder_id: None, index: None }, now)?;
    }
    for f in 0..SEED_FOLDERS {
      let folder = model.create_folder(space_id, format!("Folder {}", f + 1), None)?;
      if f == 0 {
        model.set_folder_collapsed(folder, false)?;
      }
      for _ in 0..SEED_FOLDER_TABS {
        let (url, title, favicon) = next();
        model.add_tab(url, title, favicon, TabLocation::Pinned { space_id, folder_id: Some(folder), index: None }, now)?;
      }
    }
    for _ in 0..SEED_TEMP {
      let (url, title, favicon) = next();
      let id = model.add_tab(url, title, favicon, TabLocation::Temp { space_id, index: None }, now)?;
      if space_id == first && load.len() < SEED_LOADED {
        load.push(id);
      }
    }
  }
  Ok(load)
}

/// A first-run session with [`seed`] in it instead of its home tab, and the tabs to load.
pub fn seeded_session(home_url: &str, now: u64) -> (Session, Vec<Id>) {
  let mut model = Model::new(Session::new(home_url, now));
  let home = model.session.tabs.keys().copied().collect::<Vec<_>>();
  let load = seed(&mut model, now).expect("the seed fits the model's rules");
  for id in home {
    let _ = model.remove_tab(id, now);
  }
  (model.session, load)
}

/// Writes one measurement line to stderr: `ezel-perf <what> bytes=<n> us=<µs>`.
pub fn note(what: &str, bytes: usize, since: Instant) {
  eprintln!("ezel-perf {what} bytes={bytes} us={}", since.elapsed().as_micros());
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_the_three_shapes() {
    assert_eq!(parse(""), PerfTabs::FirstRun);
    assert_eq!(parse(" none "), PerfTabs::Nothing);
    assert_eq!(parse("Seed"), PerfTabs::Seed);
    assert_eq!(
      parse("https://a.test/, http://b.test ,javascript:alert(1),file:///c:/x, ftp://x"),
      PerfTabs::Urls(vec!["https://a.test/".into(), "http://b.test".into()])
    );
  }

  #[test]
  fn the_seed_looks_like_a_big_zen_import() {
    let mut m = Model::new(Session::new("https://home.test/", 0));
    m.restore(0);
    let first_run = m.session.tabs.len();
    let load = seed(&mut m, 1).unwrap();
    assert_eq!(m.session.tabs.len() - first_run, 131);
    assert_eq!(m.session.spaces.len(), SEED_SPACES);
    assert_eq!(load.len(), SEED_LOADED);
    let inline = m.session.tabs.values().filter(|t| t.favicon.as_deref().is_some_and(|f| f.starts_with("data:"))).count();
    assert!(inline > 0, "favicons as a Zen import brings them");
    let (session, load) = seeded_session("https://home.test/", 0);
    assert_eq!(session.tabs.len(), 131, "the home tab replaced");
    assert!(load.iter().all(|id| session.tabs.contains_key(id)));
  }
}
