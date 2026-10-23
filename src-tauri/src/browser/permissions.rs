//! Site permissions: what a site may use (camera, microphone, location, reading the clipboard),
//! asked by Ezel's own prompt (the titlebar peek) and remembered per site by Ezel, not WebView2's
//! profile, so they can be listed and revoked (`docs/design/decisions.md`, "The site speaks from
//! the peek").
//!
//! Stored in `<app data>/ezel/permissions.json`: written atomically (temp file + rename) on each
//! change, which is rare; an unreadable file is moved aside, never overwritten. Keys are origins
//! (`https://host[:port]`) built by Rust from the requesting address.

use std::{
  collections::BTreeMap,
  fs,
  path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use specta::Type;

const FILE_NAME: &str = "permissions.json";
const TEMP_NAME: &str = "permissions.json.tmp";

/// What a site can ask for through Ezel's prompt.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SitePermission {
  Camera,
  Microphone,
  Location,
  /// Reading the clipboard (writing needs no permission).
  Clipboard,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Decision {
  Allow,
  Deny,
}

/// One site's remembered answers, for the site panel and the permissions list.
#[derive(Clone, Debug, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SitePermissions {
  pub origin: String,
  /// Its host, for showing.
  pub host: String,
  pub permissions: Vec<(SitePermission, Decision)>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Permissions {
  version: u32,
  sites: BTreeMap<String, BTreeMap<SitePermission, Decision>>,
}

impl Permissions {
  pub fn get(&self, origin: &str, permission: SitePermission) -> Option<Decision> {
    self.sites.get(origin)?.get(&permission).copied()
  }

  pub fn set(&mut self, origin: &str, permission: SitePermission, decision: Decision) {
    self.version = 1;
    self.sites.entry(origin.to_string()).or_default().insert(permission, decision);
  }

  /// Forgets one answer (the site asks again next time). Returns whether there was one.
  pub fn revoke(&mut self, origin: &str, permission: SitePermission) -> bool {
    let Some(site) = self.sites.get_mut(origin) else { return false };
    let removed = site.remove(&permission).is_some();
    if site.is_empty() {
      self.sites.remove(origin);
    }
    removed
  }

  /// Every site with an answer, by origin.
  pub fn list(&self) -> Vec<SitePermissions> {
    self
      .sites
      .iter()
      .map(|(origin, perms)| SitePermissions {
        origin: origin.clone(),
        host: super::site::host_of(origin).unwrap_or_else(|| origin.clone()),
        permissions: perms.iter().map(|(p, d)| (*p, *d)).collect(),
      })
      .collect()
  }
}

/// Reads the saved answers (none on first run). An unreadable file is moved aside.
pub fn load(dir: &Path) -> Permissions {
  let path = dir.join(FILE_NAME);
  let Ok(text) = fs::read_to_string(&path) else { return Permissions::default() };
  match serde_json::from_str(&text) {
    Ok(permissions) => permissions,
    Err(_) => {
      let _ = fs::rename(&path, dir.join(format!("{FILE_NAME}.unreadable")));
      Permissions::default()
    }
  }
}

/// Writes them atomically: a temp file, then a rename over the old one.
pub fn save(dir: &Path, permissions: &Permissions) -> std::io::Result<()> {
  fs::create_dir_all(dir)?;
  let json = serde_json::to_string_pretty(permissions).map_err(std::io::Error::other)?;
  let temp: PathBuf = dir.join(TEMP_NAME);
  fs::write(&temp, json)?;
  fs::rename(&temp, dir.join(FILE_NAME))
}

#[cfg(test)]
mod tests {
  use super::*;

  const SITE: &str = "https://meet.example.com";

  #[test]
  fn answers_are_remembered_per_site_and_kind() {
    let mut p = Permissions::default();
    assert_eq!(p.get(SITE, SitePermission::Camera), None, "nothing yet: ask");
    p.set(SITE, SitePermission::Camera, Decision::Allow);
    p.set(SITE, SitePermission::Location, Decision::Deny);
    assert_eq!(p.get(SITE, SitePermission::Camera), Some(Decision::Allow));
    assert_eq!(p.get(SITE, SitePermission::Microphone), None, "each kind on its own");
    assert_eq!(p.get("https://other.test", SitePermission::Camera), None, "each site on its own");
    let site = p.list().into_iter().find(|s| s.origin == SITE).unwrap();
    assert_eq!(site.host, "meet.example.com");
    assert_eq!(site.permissions, vec![(SitePermission::Camera, Decision::Allow), (SitePermission::Location, Decision::Deny)]);
  }

  #[test]
  fn revoking_forgets_and_empties_sites() {
    let mut p = Permissions::default();
    p.set(SITE, SitePermission::Clipboard, Decision::Allow);
    assert!(p.revoke(SITE, SitePermission::Clipboard));
    assert!(!p.revoke(SITE, SitePermission::Clipboard), "already gone");
    assert!(!p.revoke("https://never.test", SitePermission::Camera));
    assert!(p.list().is_empty(), "a site with nothing left isn't listed");
  }

  #[test]
  fn saved_answers_load_back_and_bad_files_are_kept_aside() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/test-tmp").join(format!("ezel-permissions-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    assert_eq!(load(&dir), Permissions::default(), "first run");
    let mut p = Permissions::default();
    p.set(SITE, SitePermission::Microphone, Decision::Deny);
    save(&dir, &p).unwrap();
    assert_eq!(load(&dir), p);
    fs::write(dir.join(FILE_NAME), "{ not json").unwrap();
    assert_eq!(load(&dir), Permissions::default());
    assert_eq!(fs::read_to_string(dir.join("permissions.json.unreadable")).unwrap(), "{ not json", "moved aside, not overwritten");
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn names_match_the_contract() {
    assert_eq!(serde_json::to_value(SitePermission::Location).unwrap(), "location");
    assert!(serde_json::from_str::<SitePermission>("\"notifications\"").is_err(), "not something Ezel prompts for");
  }
}
