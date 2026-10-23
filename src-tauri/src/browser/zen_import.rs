//! Import from Zen (docs/research/zen-import.md): finds Zen's default profile, copies its session
//! file into Ezel's own app-data folder (Zen's profile is only ever read, never written), decodes
//! it (Mozilla LZ4), and turns its spaces, Essentials, pinned tabs, folders and open tabs into an
//! [`ImportPlan`] the model applies. Parsing and planning are pure and tested on small samples.
//! Logins, passwords and cookies aren't imported.

use std::{
  collections::{HashMap, HashSet},
  fs,
  path::{Path, PathBuf},
};

use serde::Serialize;
use serde_json::Value;
use specta::Type;

use super::url_policy;
use crate::error::{AppError, ErrorCode};

const MOZLZ4_MAGIC: &[u8] = b"mozLz40\0";
/// Bigger than any real session; guards the decoder against a bogus size field.
const MAX_SESSION_BYTES: usize = 256 * 1024 * 1024;
const MAX_SPACE_NAME: usize = 40;
const MAX_FOLDER_NAME: usize = 60;

/// A Zen tab, as Ezel needs it.
#[derive(Clone, Debug, PartialEq)]
pub struct ZenTab {
  pub url: String,
  pub title: Option<String>,
  pub favicon: Option<String>,
  pub space: Option<String>,
  pub essential: bool,
  pub pinned: bool,
  pub folder: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ZenFolder {
  pub id: String,
  pub name: String,
  pub collapsed: bool,
  pub parent: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ZenSpace {
  pub uuid: String,
  pub name: String,
  pub icon: String,
}

/// What Zen's session holds, in its sidebar order.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ZenData {
  pub spaces: Vec<ZenSpace>,
  pub tabs: Vec<ZenTab>,
  pub folders: Vec<ZenFolder>,
}

/// Decodes a `.jsonlz4` file (Mozilla's LZ4 framing).
pub fn decode_mozlz4(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
  let bad = || AppError::invalid_input("that isn't a Zen session file");
  if bytes.len() < 12 || &bytes[..8] != MOZLZ4_MAGIC {
    return Err(bad());
  }
  let size = u32::from_le_bytes(bytes[8..12].try_into().map_err(|_| bad())?) as usize;
  if size > MAX_SESSION_BYTES {
    return Err(bad());
  }
  lz4_flex::block::decompress(&bytes[12..], size).map_err(|_| bad())
}

/// A string field, trimmed, if present and not empty.
fn text(value: &Value, key: &str) -> Option<String> {
  value.get(key)?.as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

/// A name cut to `max` characters, on one line.
fn name(raw: &str, max: usize, fallback: &str) -> String {
  let one_line: String = raw.split_whitespace().collect::<Vec<_>>().join(" ");
  let cut: String = one_line.chars().take(max).collect();
  if cut.is_empty() { fallback.to_string() } else { cut }
}

/// Zen's icon (an emoji, or a `…/selectable/<name>.svg` path) as a lucide name Ezel may know
/// (the UI falls back to its default for names it doesn't).
fn icon(raw: Option<String>) -> String {
  let fallback = "layers".to_string();
  let Some(raw) = raw else { return fallback };
  let file = raw.rsplit('/').next().unwrap_or("");
  match file.strip_suffix(".svg") {
    Some(stem) if !stem.is_empty() && stem.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') => stem.to_string(),
    _ => fallback,
  }
}

/// Reads Zen's session JSON: `zen-sessions.jsonlz4` (`{ tabs, folders, spaces }`) or, from older
/// builds, `recovery.jsonlz4` (the same under `windows[0]`).
pub fn parse(json: &[u8]) -> Result<ZenData, AppError> {
  let root: Value = serde_json::from_slice(json).map_err(|_| AppError::invalid_input("Zen's session file can't be read"))?;
  let sidebar = if root.get("tabs").is_some() || root.get("spaces").is_some() {
    &root
  } else {
    root.get("windows").and_then(|w| w.get(0)).ok_or_else(|| AppError::invalid_input("Zen's session file has no tabs"))?
  };
  let list = |key: &str| sidebar.get(key).and_then(Value::as_array).cloned().unwrap_or_default();

  let spaces = list("spaces")
    .iter()
    .filter_map(|s| {
      let uuid = text(s, "uuid")?;
      Some(ZenSpace { uuid, name: name(&text(s, "name").unwrap_or_default(), MAX_SPACE_NAME, "Zen"), icon: icon(text(s, "icon")) })
    })
    .collect();

  let folders = list("folders")
    .iter()
    .filter_map(|f| {
      Some(ZenFolder {
        id: text(f, "id")?,
        name: name(&text(f, "name").unwrap_or_default(), MAX_FOLDER_NAME, "Folder"),
        collapsed: f.get("collapsed").and_then(Value::as_bool).unwrap_or(false),
        parent: text(f, "parentId"),
      })
    })
    .collect();

  let tabs = list("tabs")
    .iter()
    .filter_map(|t| {
      let flag = |key: &str| t.get(key).and_then(Value::as_bool).unwrap_or(false);
      if flag("zenIsEmpty") || flag("zenIsGlance") {
        return None;
      }
      let entries = t.get("entries")?.as_array()?;
      let index = t.get("index").and_then(Value::as_u64).unwrap_or(entries.len() as u64).max(1) as usize;
      let entry = entries.get(index - 1).or_else(|| entries.last())?;
      let url = text(entry, "url")?;
      if !url_policy::is_allowed(&url) || url == url_policy::FALLBACK {
        return None;
      }
      let favicon = text(t, "image").filter(|f| f.starts_with("https://") || f.starts_with("http://") || f.starts_with("data:image/"));
      Some(ZenTab {
        url,
        title: text(t, "zenStaticLabel").or_else(|| text(entry, "title")),
        favicon,
        space: text(t, "zenWorkspace"),
        essential: flag("zenEssential"),
        pinned: flag("pinned") || flag("zenEssential"),
        folder: text(t, "groupId"),
      })
    })
    .collect();

  Ok(ZenData { spaces, tabs, folders })
}

/// One Zen space in the import dialog.
#[derive(Clone, Debug, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ZenSpacePreview {
  pub id: String,
  pub name: String,
  pub icon: String,
  pub pinned: u32,
  pub folders: u32,
  pub open: u32,
}

/// What `find_zen_import` found.
#[derive(Clone, Debug, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ZenImportPreview {
  pub spaces: Vec<ZenSpacePreview>,
  pub essentials: u32,
}

/// The import, as the model applies it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ImportPlan {
  pub essentials: Vec<ZenTab>,
  pub spaces: Vec<SpacePlan>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SpacePlan {
  pub name: String,
  pub icon: String,
  /// Pinned items in order.
  pub pinned: Vec<PinnedPlan>,
  /// Open (unpinned) tabs in Zen's order.
  pub temp: Vec<ZenTab>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum PinnedPlan {
  Tab(ZenTab),
  Folder { name: String, collapsed: bool, tabs: Vec<ZenTab> },
}

impl ZenData {
  /// The top-level folder a folder id belongs to (Ezel's folders don't nest).
  fn folder_of(&self, id: &str) -> Option<&ZenFolder> {
    self.folders.iter().find(|f| f.id == id)
  }

  /// Tabs that aren't Essentials, for a space.
  fn space_tabs<'a>(&'a self, uuid: &'a str) -> impl Iterator<Item = &'a ZenTab> + 'a {
    self.tabs.iter().filter(move |t| !t.essential && t.space.as_deref() == Some(uuid))
  }

  pub fn preview(&self) -> ZenImportPreview {
    ZenImportPreview {
      spaces: self
        .spaces
        .iter()
        .map(|s| {
          let tabs: Vec<&ZenTab> = self.space_tabs(&s.uuid).collect();
          let folders: HashSet<&str> = tabs.iter().filter(|t| t.pinned).filter_map(|t| t.folder.as_deref()).filter(|f| self.folder_of(f).is_some()).collect();
          ZenSpacePreview {
            id: s.uuid.clone(),
            name: s.name.clone(),
            icon: s.icon.clone(),
            pinned: tabs.iter().filter(|t| t.pinned).count() as u32,
            folders: folders.len() as u32,
            open: tabs.iter().filter(|t| !t.pinned).count() as u32,
          }
        })
        .collect(),
      essentials: self.tabs.iter().filter(|t| t.essential).count() as u32,
    }
  }

  /// The chosen spaces (by uuid, in Zen's order) and, if wanted, the Essentials.
  pub fn plan(&self, spaces: &[String], essentials: bool) -> Result<ImportPlan, AppError> {
    for id in spaces {
      if !self.spaces.iter().any(|s| &s.uuid == id) {
        return Err(AppError::not_found("that Zen space isn't in the profile"));
      }
    }
    let chosen = self.spaces.iter().filter(|s| spaces.contains(&s.uuid));
    let mut plan = ImportPlan {
      essentials: if essentials { self.tabs.iter().filter(|t| t.essential).cloned().collect() } else { vec![] },
      spaces: vec![],
    };
    for space in chosen {
      let mut pinned: Vec<PinnedPlan> = vec![];
      // Folder (by id) → its place in `pinned`, so a folder's tabs gather where it first shows.
      let mut folder_at: HashMap<String, usize> = HashMap::new();
      let mut temp = vec![];
      for tab in self.space_tabs(&space.uuid) {
        if !tab.pinned {
          temp.push(tab.clone());
          continue;
        }
        match tab.folder.as_deref().and_then(|id| self.folder_of(id)) {
          Some(folder) => {
            let at = *folder_at.entry(folder.id.clone()).or_insert_with(|| {
              let name = match folder.parent.as_deref().and_then(|p| self.folder_of(p)) {
                // A nested folder: its own folder, its parent's name in front.
                Some(parent) => name(&format!("{} / {}", parent.name, folder.name), MAX_FOLDER_NAME, "Folder"),
                None => folder.name.clone(),
              };
              pinned.push(PinnedPlan::Folder { name, collapsed: folder.collapsed, tabs: vec![] });
              pinned.len() - 1
            });
            if let PinnedPlan::Folder { tabs, .. } = &mut pinned[at] {
              tabs.push(tab.clone());
            }
          }
          None => pinned.push(PinnedPlan::Tab(tab.clone())),
        }
      }
      plan.spaces.push(SpacePlan { name: space.name.clone(), icon: space.icon.clone(), pinned, temp });
    }
    Ok(plan)
  }
}

/// What an import added.
#[derive(Clone, Debug, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
  pub spaces: u32,
  pub tabs: u32,
}

/// Applies a plan to the model: new spaces (appended), Essentials into free Swatches and the rest
/// pinned at the start of the first new space, folders and pinned tabs in order, open tabs as temp
/// tabs. Nothing loads. Folder names are already checked; space names too.
pub fn apply(plan: &ImportPlan, model: &mut super::model::Model, now: u64) -> Result<ImportSummary, AppError> {
  use super::model::TabLocation;
  let mut summary = ImportSummary { spaces: 0, tabs: 0 };
  let mut first_space = None;
  let mut overflow = vec![];
  for tab in &plan.essentials {
    match model.free_swatch() {
      Some(slot) => {
        model.add_tab(tab.url.clone(), tab.title.clone(), tab.favicon.clone(), TabLocation::Swatch { slot }, now)?;
        summary.tabs += 1;
      }
      None => overflow.push(tab),
    }
  }
  for space in &plan.spaces {
    let space_id = model.create_space(space.name.clone(), space.icon.clone());
    first_space.get_or_insert(space_id);
    summary.spaces += 1;
    let pinned = |folder_id| TabLocation::Pinned { space_id, folder_id, index: None };
    for item in &space.pinned {
      match item {
        PinnedPlan::Tab(tab) => {
          model.add_tab(tab.url.clone(), tab.title.clone(), tab.favicon.clone(), pinned(None), now)?;
          summary.tabs += 1;
        }
        PinnedPlan::Folder { name, collapsed, tabs } => {
          let folder = model.create_folder(space_id, name.clone(), None)?;
          model.set_folder_collapsed(folder, *collapsed)?;
          for tab in tabs {
            model.add_tab(tab.url.clone(), tab.title.clone(), tab.favicon.clone(), pinned(Some(folder)), now)?;
            summary.tabs += 1;
          }
        }
      }
    }
    for tab in &space.temp {
      // Zen lists open tabs oldest first; Ezel's temp tabs are newest first.
      model.add_tab(tab.url.clone(), tab.title.clone(), tab.favicon.clone(), TabLocation::Temp { space_id, index: Some(0) }, now)?;
      summary.tabs += 1;
    }
  }
  // Essentials past the 8 Swatches: pinned at the start of the first imported space, in order.
  if let Some(space_id) = first_space.or(Some(model.session.active_space)) {
    for (i, tab) in overflow.into_iter().enumerate() {
      model.add_tab(tab.url.clone(), tab.title.clone(), tab.favicon.clone(), TabLocation::Pinned { space_id, folder_id: None, index: Some(i) }, now)?;
      summary.tabs += 1;
    }
  }
  Ok(summary)
}

/// Zen's default profile folder (`%APPDATA%\zen`, `profiles.ini`), or `not_found`.
pub fn find_profile(zen_dir: &Path) -> Result<PathBuf, AppError> {
  let missing = || AppError::not_found("Zen isn't installed for this user");
  let ini = fs::read_to_string(zen_dir.join("profiles.ini")).map_err(|_| missing())?;
  let path = default_profile_path(&ini).ok_or_else(missing)?;
  let full = if path.1 { zen_dir.join(path.0) } else { PathBuf::from(path.0) };
  if full.is_dir() { Ok(full) } else { Err(missing()) }
}

/// (Path=, IsRelative) of the default profile in a `profiles.ini`: the `[Install…]` section's
/// `Default=`, else the profile with `Default=1`, else the first one.
pub fn default_profile_path(ini: &str) -> Option<(String, bool)> {
  let mut sections: Vec<(String, HashMap<String, String>)> = vec![];
  for line in ini.lines().map(str::trim) {
    if let Some(name) = line.strip_prefix('[').and_then(|l| l.strip_suffix(']')) {
      sections.push((name.to_string(), HashMap::new()));
    } else if let (Some((key, value)), Some(section)) = (line.split_once('='), sections.last_mut()) {
      section.1.insert(key.trim().to_string(), value.trim().to_string());
    }
  }
  let profiles: Vec<&HashMap<String, String>> = sections.iter().filter(|(n, _)| n.starts_with("Profile")).map(|(_, s)| s).collect();
  // Firefox treats a missing `IsRelative` as relative.
  let relative = |p: &HashMap<String, String>| p.get("IsRelative").map(String::as_str) != Some("0");
  let install = sections.iter().find(|(n, _)| n.starts_with("Install")).and_then(|(_, s)| s.get("Default")).cloned();
  if let Some(path) = install {
    let is_relative = profiles.iter().find(|p| p.get("Path") == Some(&path)).map_or(true, |p| relative(p));
    return Some((path.replace('/', "\\"), is_relative));
  }
  let profile = profiles.iter().find(|p| p.get("Default").map(String::as_str) == Some("1")).or(profiles.first())?;
  profile.get("Path").map(|path| (path.replace('/', "\\"), relative(profile)))
}

/// Copies Zen's session file into `work` (inside Ezel's app data) and reads the copy. A file Zen
/// holds locked: `unavailable` ("close Zen"). The copy is deleted after reading.
pub fn read_session(profile: &Path, work: &Path) -> Result<ZenData, AppError> {
  let candidates = [profile.join("zen-sessions.jsonlz4"), profile.join("sessionstore-backups").join("recovery.jsonlz4")];
  let source = candidates.iter().find(|p| p.is_file()).ok_or_else(|| AppError::not_found("Zen has no saved session yet"))?;
  fs::create_dir_all(work).map_err(|e| AppError::internal(format!("import folder: {}", e.kind())))?;
  let copy = work.join("zen-session.jsonlz4");
  let copied = fs::copy(source, &copy);
  let result = match copied {
    Ok(_) => fs::read(&copy).map_err(|e| AppError::internal(format!("read copy: {}", e.kind()))).and_then(|bytes| decode_mozlz4(&bytes)).and_then(|json| parse(&json)),
    // Windows' sharing violation: Zen has the file open.
    Err(e) if e.raw_os_error() == Some(32) || e.kind() == std::io::ErrorKind::PermissionDenied => {
      Err(AppError::new(ErrorCode::Unavailable, "Zen is using its files: close Zen, then try again"))
    }
    Err(e) => Err(AppError::internal(format!("copy Zen's session: {}", e.kind()))),
  };
  let _ = fs::remove_file(&copy);
  result
}

#[cfg(test)]
mod tests {
  use super::*;

  /// A small session like Zen's: two spaces, two Essentials, a folder with a nested folder, pinned
  /// and open tabs, and the tabs Ezel skips.
  fn sample() -> Value {
    serde_json::json!({
      "spaces": [
        { "uuid": "{w1}", "name": "Work", "icon": "chrome://browser/skin/zen-icons/selectable/briefcase.svg" },
        { "uuid": "{w2}", "name": "  Home  ", "icon": "🏠" }
      ],
      "folders": [
        { "id": "f1", "name": "Refs", "collapsed": true, "parentId": null },
        { "id": "f2", "name": "Deep", "collapsed": false, "parentId": "f1" }
      ],
      "tabs": [
        { "entries": [{ "url": "https://mail.test/", "title": "Mail" }], "index": 1, "zenEssential": true, "pinned": true, "zenWorkspace": "{w1}" },
        { "entries": [{ "url": "https://cal.test/", "title": "Calendar" }], "index": 1, "zenEssential": true, "image": "https://cal.test/icon.png" },
        { "entries": [{ "url": "https://figma.test/a", "title": "Old" }, { "url": "https://figma.test/b", "title": "Figma" }], "index": 2, "pinned": true, "zenWorkspace": "{w1}" },
        { "entries": [{ "url": "https://ref.test/", "title": "Ref" }], "index": 1, "pinned": true, "groupId": "f1", "zenWorkspace": "{w1}" },
        { "entries": [{ "url": "https://deep.test/", "title": "Deep one" }], "index": 1, "pinned": true, "groupId": "f2", "zenWorkspace": "{w1}" },
        { "entries": [{ "url": "https://ref2.test/" }], "index": 1, "pinned": true, "groupId": "f1", "zenWorkspace": "{w1}", "zenStaticLabel": "Renamed" },
        { "entries": [{ "url": "https://news.test/", "title": "News" }], "index": 1, "zenWorkspace": "{w1}" },
        { "entries": [{ "url": "about:newtab" }], "index": 1, "zenWorkspace": "{w1}" },
        { "entries": [{ "url": "file:///C:/secret.txt" }], "index": 1, "zenWorkspace": "{w1}" },
        { "entries": [{ "url": "https://empty.test/" }], "index": 1, "zenIsEmpty": true, "zenWorkspace": "{w1}" },
        { "entries": [{ "url": "https://glance.test/" }], "index": 1, "zenIsGlance": true, "zenWorkspace": "{w1}" },
        { "entries": [{ "url": "https://home.test/", "title": "Home" }], "index": 1, "zenWorkspace": "{w2}" }
      ]
    })
  }

  fn data() -> ZenData {
    parse(serde_json::to_string(&sample()).unwrap().as_bytes()).unwrap()
  }

  #[test]
  fn reads_spaces_tabs_and_folders_and_skips_what_ezel_cant_open() {
    let d = data();
    assert_eq!(d.spaces[0], ZenSpace { uuid: "{w1}".into(), name: "Work".into(), icon: "briefcase".into() });
    assert_eq!(d.spaces[1].name, "Home");
    assert_eq!(d.spaces[1].icon, "layers", "emoji icons get Ezel's default");
    let urls: Vec<&str> = d.tabs.iter().map(|t| t.url.as_str()).collect();
    assert_eq!(urls, vec!["https://mail.test/", "https://cal.test/", "https://figma.test/b", "https://ref.test/", "https://deep.test/", "https://ref2.test/", "https://news.test/", "https://home.test/"]);
    assert_eq!(d.tabs[2].title.as_deref(), Some("Figma"), "the current history entry");
    assert_eq!(d.tabs[5].title.as_deref(), Some("Renamed"), "Zen's own label wins");
    assert!(d.tabs[1].essential && d.tabs[1].pinned);
    assert_eq!(d.tabs[1].favicon.as_deref(), Some("https://cal.test/icon.png"));
  }

  #[test]
  fn previews_count_what_each_space_holds() {
    let p = data().preview();
    assert_eq!(p.essentials, 2);
    assert_eq!(p.spaces[0], ZenSpacePreview { id: "{w1}".into(), name: "Work".into(), icon: "briefcase".into(), pinned: 4, folders: 2, open: 1 });
    assert_eq!((p.spaces[1].pinned, p.spaces[1].open), (0, 1));
  }

  #[test]
  fn plans_keep_order_and_flatten_nested_folders() {
    let plan = data().plan(&["{w1}".into()], true).unwrap();
    assert_eq!(plan.essentials.len(), 2);
    assert_eq!(plan.spaces.len(), 1);
    let work = &plan.spaces[0];
    assert!(matches!(&work.pinned[0], PinnedPlan::Tab(t) if t.url == "https://figma.test/b"));
    assert!(matches!(&work.pinned[1], PinnedPlan::Folder { name, collapsed: true, tabs } if name == "Refs" && tabs.len() == 2));
    assert!(matches!(&work.pinned[2], PinnedPlan::Folder { name, tabs, .. } if name == "Refs / Deep" && tabs.len() == 1));
    assert_eq!(work.temp.iter().map(|t| t.url.as_str()).collect::<Vec<_>>(), vec!["https://news.test/"]);

    assert!(data().plan(&["{w2}".into()], false).unwrap().essentials.is_empty(), "Essentials only when asked");
    assert_eq!(data().plan(&["{nope}".into()], true).unwrap_err().code, ErrorCode::NotFound);
  }

  #[test]
  fn reads_mozlz4_and_old_recovery_files() {
    let json = serde_json::json!({ "windows": [sample()] }).to_string();
    let mut file = MOZLZ4_MAGIC.to_vec();
    file.extend_from_slice(&(json.len() as u32).to_le_bytes());
    file.extend_from_slice(&lz4_flex::block::compress(json.as_bytes()));
    let decoded = decode_mozlz4(&file).unwrap();
    assert_eq!(parse(&decoded).unwrap(), data(), "recovery.jsonlz4's windows[0] reads the same");
    assert!(decode_mozlz4(b"not a session").is_err());
    let mut huge = MOZLZ4_MAGIC.to_vec();
    huge.extend_from_slice(&u32::MAX.to_le_bytes());
    assert!(decode_mozlz4(&huge).is_err(), "a bogus size is refused, not allocated");
    assert!(parse(b"{ nope").is_err());
  }

  #[test]
  fn applying_a_plan_builds_spaces_swatches_and_folders() {
    use super::super::model::{Model, Pinned, Session};
    let mut m = Model::new(Session::new("https://home.test/", 0));
    m.restore(0);
    let before = m.session.spaces.len();
    let mut plan = data().plan(&["{w1}".into(), "{w2}".into()], true).unwrap();
    // More Essentials than Swatches: the rest are pinned.
    for i in 0..8 {
      plan.essentials.push(ZenTab { url: format!("https://e{i}.test/"), title: None, favicon: None, space: None, essential: true, pinned: true, folder: None });
    }
    let summary = apply(&plan, &mut m, 1).unwrap();
    assert_eq!(summary.spaces, 2);
    assert_eq!(m.session.spaces.len(), before + 2);
    assert!(m.session.swatches.iter().all(Option::is_some), "8 Swatches filled");
    let work = &m.session.spaces[before];
    assert_eq!(work.name, "Work");
    // 2 overflowing Essentials first, then Figma, then the two folders.
    assert_eq!(work.pinned.len(), 5);
    assert!(matches!(&work.pinned[3], Pinned::Folder(f) if f.name == "Refs" && f.collapsed && f.tabs.len() == 2));
    assert_eq!(work.temp.len(), 1);
    assert_eq!(summary.tabs as usize, m.session.tabs.len() - 1, "every imported tab, the first-run tab aside");
    assert!(m.live.len() <= 1, "nothing new loaded");
  }

  #[test]
  fn finds_the_default_profile() {
    let ini = "[General]\nStartWithLastProfile=1\n\n[Profile1]\nName=old\nIsRelative=1\nPath=Profiles/old.default\n\n[Profile0]\nName=main\nIsRelative=1\nPath=Profiles/abc.Default (release)\nDefault=1\n";
    assert_eq!(default_profile_path(ini), Some(("Profiles\\abc.Default (release)".into(), true)));
    let with_install = format!("{ini}\n[InstallABCDEF]\nDefault=Profiles/old.default\nLocked=1\n");
    assert_eq!(default_profile_path(&with_install), Some(("Profiles\\old.default".into(), true)));
    let absolute = "[Profile0]\nIsRelative=0\nPath=D:\\Zen\\p\n";
    assert_eq!(default_profile_path(absolute), Some(("D:\\Zen\\p".into(), false)));
    assert_eq!(default_profile_path("[General]\n"), None);
  }

  #[test]
  fn a_missing_zen_is_not_found_and_the_copy_is_cleaned_up() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/test-tmp").join(format!("ezel-zen-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    assert_eq!(find_profile(&root.join("zen")).unwrap_err().code, ErrorCode::NotFound);
    let profile = root.join("zen/Profiles/p");
    fs::create_dir_all(&profile).unwrap();
    fs::write(root.join("zen/profiles.ini"), "[Profile0]\nIsRelative=1\nPath=Profiles/p\n").unwrap();
    assert_eq!(find_profile(&root.join("zen")).unwrap(), root.join("zen").join("Profiles\\p"));
    assert_eq!(read_session(&profile, &root.join("work")).unwrap_err().code, ErrorCode::NotFound, "no session yet");
    let json = sample().to_string();
    let mut file = MOZLZ4_MAGIC.to_vec();
    file.extend_from_slice(&(json.len() as u32).to_le_bytes());
    file.extend_from_slice(&lz4_flex::block::compress(json.as_bytes()));
    fs::write(profile.join("zen-sessions.jsonlz4"), &file).unwrap();
    assert_eq!(read_session(&profile, &root.join("work")).unwrap(), data());
    assert!(!root.join("work/zen-session.jsonlz4").exists(), "the copy is removed");
    assert_eq!(fs::read(profile.join("zen-sessions.jsonlz4")).unwrap(), file, "Zen's file is untouched");
    let _ = fs::remove_dir_all(&root);
  }
}
