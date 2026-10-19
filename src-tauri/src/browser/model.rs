//! Tabs, folders, spaces and swatches as plain data. No Tauri, no webviews: every operation edits the
//! model and returns the [`Effect`]s the runtime must apply to the native webviews, so the rules here
//! are unit-tested on their own.
//!
//! Modelled on Zen (workspaces, pinned tabs, folders, essentials) and Arc (spaces, pinned/today tabs,
//! favorites). See `docs/design/decisions.md`, "Tabs, folders and spaces".

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

pub type Id = u64;

/// Swatches (Zen's essentials, Arc's favorites): a global grid shared by every space.
pub const SWATCH_SLOTS: usize = 8;

/// Most loaded webviews kept at once, the active one included. Beyond this the least recently used
/// background tabs are unloaded (they keep their place and reload when selected).
pub const MAX_LOADED_TABS: usize = 8;

/// Background tabs unused for this long are unloaded.
pub const IDLE_UNLOAD_MS: u64 = 30 * 60 * 1000;

/// Bumped when the persisted shape changes incompatibly.
const SESSION_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
  pub id: Id,
  pub url: String,
  pub title: Option<String>,
  pub favicon: Option<String>,
  /// Pinned and swatch tabs: the URL closing or resetting the tab returns to (Zen's pinned state).
  pub pinned_url: Option<String>,
  /// Unix ms of the last time the tab was selected. Drives LRU unloading and the close fallback.
  pub last_accessed: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
  pub id: Id,
  pub name: String,
  pub collapsed: bool,
  pub tabs: Vec<Id>,
}

/// A space's pinned list mixes standalone tabs and folders.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Pinned {
  Tab { id: Id },
  Folder(Folder),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
  pub id: Id,
  pub name: String,
  /// A lucide icon name; the UI maps it to a component.
  pub icon: String,
  pub pinned: Vec<Pinned>,
  /// Unpinned tabs (Arc's "Today"), newest first.
  pub temp: Vec<Id>,
  /// The tab this space shows when selected (any tab, a swatch included).
  pub active_tab: Option<Id>,
}

/// Everything that survives a restart.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
  pub version: u32,
  pub next_id: Id,
  pub spaces: Vec<Space>,
  pub active_space: Id,
  pub swatches: [Option<Id>; SWATCH_SLOTS],
  pub tabs: HashMap<Id, Tab>,
}

/// Where a tab lives. Also the target of [`Model::move_tab`].
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Location {
  #[serde(rename_all = "camelCase")]
  Swatch { slot: usize },
  /// `folder_id: None` = the space's pinned list itself. `index: None` = the end.
  #[serde(rename_all = "camelCase")]
  Pinned { space_id: Id, folder_id: Option<Id>, index: Option<usize> },
  /// `index: None` = the top (newest first).
  #[serde(rename_all = "camelCase")]
  Temp { space_id: Id, index: Option<usize> },
}

/// What the runtime must do to the native webviews after an operation.
#[derive(Clone, Debug, PartialEq)]
pub enum Effect {
  /// Make this the visible tab, creating its webview at `Tab::url` if it isn't loaded. `None` = no tab.
  Show(Option<Id>),
  /// Close the tab's webview (unload or close).
  Destroy(Id),
  Navigate(Id, String),
}

/// Per-tab runtime state of a loaded tab (has a webview). Never persisted.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Live {
  pub is_loading: bool,
  pub can_go_back: bool,
  pub can_go_forward: bool,
  pub playing_audio: bool,
}

pub type Result<T> = std::result::Result<T, String>;

pub struct Model {
  pub session: Session,
  /// Loaded tabs. The model decides what's loaded; the runtime makes the webviews match.
  pub live: HashMap<Id, Live>,
}

impl Session {
  /// First run: one space with one tab.
  pub fn new(home_url: &str, now: u64) -> Self {
    let (space, tab) = (1, 2);
    Session {
      version: SESSION_VERSION,
      next_id: 3,
      spaces: vec![Space {
        id: space,
        name: "Home".into(),
        icon: "house".into(),
        pinned: vec![],
        temp: vec![tab],
        active_tab: Some(tab),
      }],
      active_space: space,
      swatches: Default::default(),
      tabs: HashMap::from([(tab, new_tab(tab, home_url, now))]),
    }
  }

  /// Repairs a loaded session: drops dangling references and orphaned tabs, so a bad file
  /// (hand edits, a crash mid-change in an older build) can never break the model's invariants.
  pub fn repaired(mut self, home_url: &str, now: u64) -> Self {
    if self.version != SESSION_VERSION || self.spaces.is_empty() {
      return Session::new(home_url, now);
    }
    let mut seen = HashSet::new();
    let mut keep = |id: &Id, tabs: &HashMap<Id, Tab>| tabs.contains_key(id) && seen.insert(*id);
    for slot in &mut self.swatches {
      *slot = slot.filter(|id| keep(id, &self.tabs));
    }
    for space in &mut self.spaces {
      space.temp.retain(|id| keep(id, &self.tabs));
      space.pinned.retain_mut(|item| match item {
        Pinned::Tab { id } => keep(id, &self.tabs),
        Pinned::Folder(folder) => {
          folder.tabs.retain(|id| keep(id, &self.tabs));
          true
        }
      });
    }
    self.tabs.retain(|id, _| seen.contains(id));
    for space in &mut self.spaces {
      space.active_tab = space.active_tab.filter(|id| self.tabs.contains_key(id));
    }
    if !self.spaces.iter().any(|s| s.id == self.active_space) {
      self.active_space = self.spaces[0].id;
    }
    let max_id = self.spaces.iter().map(|s| s.id).chain(self.tabs.keys().copied()).chain(
      self.spaces.iter().flat_map(|s| s.pinned.iter()).filter_map(|p| match p {
        Pinned::Folder(f) => Some(f.id),
        Pinned::Tab { .. } => None,
      }),
    );
    self.next_id = self.next_id.max(max_id.max().unwrap_or(0) + 1);
    self
  }
}

/// Inserts at `index`, clamped to the end.
fn insert_at<T>(list: &mut Vec<T>, index: usize, item: T) {
  list.insert(index.min(list.len()), item);
}

fn new_tab(id: Id, url: &str, now: u64) -> Tab {
  Tab { id, url: url.into(), title: None, favicon: None, pinned_url: None, last_accessed: now }
}

impl Model {
  /// A restored session starts with nothing loaded; [`Model::restore`] loads only the active tab.
  pub fn new(session: Session) -> Self {
    Model { session, live: HashMap::new() }
  }

  /// Shows the active space's tab (lazy restore: every other tab loads when selected).
  pub fn restore(&mut self, now: u64) -> Vec<Effect> {
    let tab = self.active_space().active_tab;
    if let Some(id) = tab {
      self.touch(id, now);
    }
    vec![Effect::Show(tab)]
  }

  // ---- Queries ----

  pub fn active_space(&self) -> &Space {
    self.space(self.session.active_space).expect("active space exists")
  }

  pub fn active_tab(&self) -> Option<Id> {
    self.active_space().active_tab
  }

  pub fn tab(&self, id: Id) -> Result<&Tab> {
    self.session.tabs.get(&id).ok_or_else(|| format!("tab {id} not found"))
  }

  fn space(&self, id: Id) -> Result<&Space> {
    self.session.spaces.iter().find(|s| s.id == id).ok_or_else(|| format!("space {id} not found"))
  }

  fn space_mut(&mut self, id: Id) -> Result<&mut Space> {
    self.session.spaces.iter_mut().find(|s| s.id == id).ok_or_else(|| format!("space {id} not found"))
  }

  fn folder_mut(&mut self, id: Id) -> Result<(Id, &mut Folder)> {
    self
      .session
      .spaces
      .iter_mut()
      .find_map(|s| {
        s.pinned.iter_mut().find_map(|p| match p {
          Pinned::Folder(f) if f.id == id => Some(f),
          _ => None,
        })
        .map(|f| (s.id, f))
      })
      .ok_or_else(|| format!("folder {id} not found"))
  }

  /// Where the tab lives. A linear scan: tab counts are small, and one source of truth beats a
  /// reverse index that can drift out of sync.
  pub fn locate(&self, id: Id) -> Option<Location> {
    if let Some(slot) = self.session.swatches.iter().position(|s| *s == Some(id)) {
      return Some(Location::Swatch { slot });
    }
    for space in &self.session.spaces {
      if let Some(index) = space.temp.iter().position(|t| *t == id) {
        return Some(Location::Temp { space_id: space.id, index: Some(index) });
      }
      for (i, item) in space.pinned.iter().enumerate() {
        match item {
          Pinned::Tab { id: t } if *t == id => {
            return Some(Location::Pinned { space_id: space.id, folder_id: None, index: Some(i) })
          }
          Pinned::Folder(f) => {
            if let Some(index) = f.tabs.iter().position(|t| *t == id) {
              return Some(Location::Pinned { space_id: space.id, folder_id: Some(f.id), index: Some(index) });
            }
          }
          _ => {}
        }
      }
    }
    None
  }

  /// The tabs a space lists (pinned, folders and temp). Swatches belong to every space.
  fn space_tabs(space: &Space) -> impl Iterator<Item = Id> + '_ {
    space
      .pinned
      .iter()
      .flat_map(|p| match p {
        Pinned::Tab { id } => std::slice::from_ref(id),
        Pinned::Folder(f) => f.tabs.as_slice(),
      })
      .chain(&space.temp)
      .copied()
  }

  // ---- Tabs ----

  /// Opens `url` in a new temp tab in the active space and selects it.
  pub fn open_tab(&mut self, url: String, now: u64) -> (Id, Vec<Effect>) {
    let id = self.alloc_id();
    self.session.tabs.insert(id, new_tab(id, &url, now));
    let space = self.session.active_space;
    self.space_mut(space).expect("active space exists").temp.insert(0, id);
    (id, self.activate(id, now).expect("tab was just created"))
  }

  /// Selects a tab: it becomes its space's active tab, and that space becomes active.
  /// A swatch stays in the current space.
  pub fn activate(&mut self, id: Id, now: u64) -> Result<Vec<Effect>> {
    let space = match self.locate(id).ok_or_else(|| format!("tab {id} not found"))? {
      Location::Swatch { .. } => self.session.active_space,
      Location::Pinned { space_id, .. } | Location::Temp { space_id, .. } => space_id,
    };
    self.session.active_space = space;
    self.space_mut(space)?.active_tab = Some(id);
    self.touch(id, now);
    let mut effects = vec![Effect::Show(Some(id))];
    effects.extend(self.enforce_limit());
    Ok(effects)
  }

  /// Zen/Arc close: a temp tab is removed; a pinned or swatch tab only unloads (it keeps its place).
  pub fn close_tab(&mut self, id: Id, now: u64) -> Result<Vec<Effect>> {
    match self.locate(id) {
      Some(Location::Temp { .. }) => self.remove_tab(id, now),
      Some(_) => self.unload_tabs(&[id], true, now),
      None => Err(format!("tab {id} not found")),
    }
  }

  /// Removes a tab from wherever it lives.
  pub fn remove_tab(&mut self, id: Id, now: u64) -> Result<Vec<Effect>> {
    let location = self.locate(id).ok_or_else(|| format!("tab {id} not found"))?;
    let mut effects = self.deselect(&[id], now);
    self.detach(id, location);
    self.session.tabs.remove(&id);
    if self.live.remove(&id).is_some() {
      effects.push(Effect::Destroy(id));
    }
    Ok(effects)
  }

  /// Drops the tab's webview; the tab keeps its place and reloads its current URL when selected.
  pub fn unload_tab(&mut self, id: Id, now: u64) -> Result<Vec<Effect>> {
    self.unload_tabs(&[id], false, now)
  }

  /// `reset`: pinned and swatch tabs also go back to their pinned URL (Zen's "reset-unload-switch").
  fn unload_tabs(&mut self, ids: &[Id], reset: bool, now: u64) -> Result<Vec<Effect>> {
    for id in ids {
      self.tab(*id)?;
    }
    let mut effects = self.deselect(ids, now);
    for id in ids {
      let tab = self.session.tabs.get_mut(id).expect("checked above");
      if let (true, Some(pinned)) = (reset, &tab.pinned_url) {
        tab.url = pinned.clone();
      }
      if self.live.remove(id).is_some() {
        effects.push(Effect::Destroy(*id));
      }
    }
    Ok(effects)
  }

  /// Moves a tab: pin/unpin, into or out of a folder or a swatch, reorder, or to another space.
  /// Into an occupied swatch slot, the occupant takes the moved tab's old place (a swap).
  pub fn move_tab(&mut self, id: Id, to: Location) -> Result<()> {
    let from = self.locate(id).ok_or_else(|| format!("tab {id} not found"))?;
    self.validate(to)?;
    self.detach(id, from);
    if let Location::Swatch { slot } = to {
      if let Some(occupant) = self.session.swatches[slot].take() {
        self.attach(occupant, from);
      }
    }
    self.attach(id, to);
    self.follow_moved_tab(id, to);
    Ok(())
  }

  /// A tab moved out of the space that shows it stops being that space's tab. If that was the
  /// active space, the selection follows the tab into its new space.
  fn follow_moved_tab(&mut self, id: Id, to: Location) {
    let (Location::Pinned { space_id: dest, .. } | Location::Temp { space_id: dest, .. }) = to else { return };
    let active_space = self.session.active_space;
    let mut follow = false;
    for space in self.session.spaces.iter_mut().filter(|s| s.id != dest && s.active_tab == Some(id)) {
      space.active_tab = None;
      follow |= space.id == active_space;
    }
    if follow {
      self.session.active_space = dest;
      self.space_mut(dest).expect("validated").active_tab = Some(id);
    }
  }

  /// Navigates a pinned or swatch tab back to its pinned URL.
  pub fn reset_tab(&mut self, id: Id) -> Result<Vec<Effect>> {
    let tab = self.tab(id)?;
    let url = tab.pinned_url.clone().ok_or_else(|| format!("tab {id} is not pinned"))?;
    if self.live.contains_key(&id) {
      return Ok(vec![Effect::Navigate(id, url)]);
    }
    self.session.tabs.get_mut(&id).expect("checked above").url = url;
    Ok(vec![])
  }

  /// Makes the tab's current URL its pinned URL.
  pub fn update_pinned_url(&mut self, id: Id) -> Result<()> {
    let tab = self.session.tabs.get_mut(&id).ok_or_else(|| format!("tab {id} not found"))?;
    if tab.pinned_url.is_none() {
      return Err(format!("tab {id} is not pinned"));
    }
    tab.pinned_url = Some(tab.url.clone());
    Ok(())
  }

  /// Trash-all: removes the space's temp tabs only.
  pub fn clear_temp_tabs(&mut self, space_id: Id, now: u64) -> Result<Vec<Effect>> {
    let ids = self.space(space_id)?.temp.clone();
    let mut effects = self.deselect(&ids, now);
    self.space_mut(space_id)?.temp.clear();
    for id in ids {
      self.session.tabs.remove(&id);
      if self.live.remove(&id).is_some() {
        effects.push(Effect::Destroy(id));
      }
    }
    Ok(effects)
  }

  /// Records what the webview reports, so the tab's row and a later reload use it.
  pub fn update_page(&mut self, id: Id, url: Option<String>, title: Option<Option<String>>) {
    let Some(tab) = self.session.tabs.get_mut(&id) else { return };
    if let Some(url) = url {
      tab.url = url;
    }
    if let Some(title) = title {
      tab.title = title.filter(|t| !t.is_empty());
    }
  }

  pub fn set_favicon(&mut self, id: Id, favicon: Option<String>) {
    if let Some(tab) = self.session.tabs.get_mut(&id) {
      tab.favicon = favicon.filter(|f| !f.is_empty());
    }
  }

  // ---- Folders ----

  /// Creates an empty folder in the space's pinned list (`index: None` = the end).
  pub fn create_folder(&mut self, space_id: Id, name: String, index: Option<usize>) -> Result<Id> {
    self.space(space_id)?;
    let id = self.alloc_id();
    let folder = Pinned::Folder(Folder { id, name, collapsed: false, tabs: vec![] });
    insert_at(&mut self.space_mut(space_id)?.pinned, index.unwrap_or(usize::MAX), folder);
    Ok(id)
  }

  pub fn rename_folder(&mut self, id: Id, name: String) -> Result<()> {
    self.folder_mut(id)?.1.name = name;
    Ok(())
  }

  pub fn set_folder_collapsed(&mut self, id: Id, collapsed: bool) -> Result<()> {
    self.folder_mut(id)?.1.collapsed = collapsed;
    Ok(())
  }

  /// Moves a folder (with its tabs) within its space or to another one.
  pub fn move_folder(&mut self, id: Id, space_id: Id, index: Option<usize>) -> Result<()> {
    self.space(space_id)?;
    let (_, folder, _) = self.take_folder(id)?;
    insert_at(&mut self.space_mut(space_id)?.pinned, index.unwrap_or(usize::MAX), Pinned::Folder(folder));
    Ok(())
  }

  /// Deletes a folder. `keep_tabs`: its tabs stay pinned in its place ("unpack"); otherwise they go too.
  pub fn delete_folder(&mut self, id: Id, keep_tabs: bool, now: u64) -> Result<Vec<Effect>> {
    let (space_id, folder, index) = self.take_folder(id)?;
    if keep_tabs {
      let items = folder.tabs.into_iter().map(|id| Pinned::Tab { id });
      self.space_mut(space_id)?.pinned.splice(index..index, items);
      return Ok(vec![]);
    }
    let mut effects = self.deselect(&folder.tabs, now);
    for tab in folder.tabs {
      self.session.tabs.remove(&tab);
      if self.live.remove(&tab).is_some() {
        effects.push(Effect::Destroy(tab));
      }
    }
    Ok(effects)
  }

  pub fn unload_folder(&mut self, id: Id, now: u64) -> Result<Vec<Effect>> {
    let tabs = self.folder_mut(id)?.1.tabs.clone();
    self.unload_tabs(&tabs, false, now)
  }

  /// Removes the folder from its space: (space id, folder, the index it had).
  fn take_folder(&mut self, id: Id) -> Result<(Id, Folder, usize)> {
    for space in &mut self.session.spaces {
      let found = space.pinned.iter().position(|p| matches!(p, Pinned::Folder(f) if f.id == id));
      if let Some(index) = found {
        let Pinned::Folder(folder) = space.pinned.remove(index) else { unreachable!() };
        return Ok((space.id, folder, index));
      }
    }
    Err(format!("folder {id} not found"))
  }

  // ---- Spaces ----

  pub fn create_space(&mut self, name: String, icon: String) -> Id {
    let id = self.alloc_id();
    self.session.spaces.push(Space { id, name, icon, pinned: vec![], temp: vec![], active_tab: None });
    id
  }

  pub fn update_space(&mut self, id: Id, name: Option<String>, icon: Option<String>) -> Result<()> {
    let space = self.space_mut(id)?;
    if let Some(name) = name {
      space.name = name;
    }
    if let Some(icon) = icon {
      space.icon = icon;
    }
    Ok(())
  }

  pub fn move_space(&mut self, id: Id, index: usize) -> Result<()> {
    let from = self.session.spaces.iter().position(|s| s.id == id).ok_or_else(|| format!("space {id} not found"))?;
    let space = self.session.spaces.remove(from);
    insert_at(&mut self.session.spaces, index, space);
    Ok(())
  }

  /// Deletes a space and all its tabs. The last space can't be deleted.
  pub fn delete_space(&mut self, id: Id, now: u64) -> Result<Vec<Effect>> {
    if self.session.spaces.len() == 1 {
      return Err("can't delete the last space".into());
    }
    let index = self.session.spaces.iter().position(|s| s.id == id).ok_or_else(|| format!("space {id} not found"))?;
    let mut effects = vec![];
    if self.session.active_space == id {
      let neighbour = self.session.spaces[if index == 0 { 1 } else { index - 1 }].id;
      effects.extend(self.switch_space(neighbour, now)?);
    }
    let space = self.session.spaces.remove(index);
    for tab in Self::space_tabs(&space) {
      self.session.tabs.remove(&tab);
      if self.live.remove(&tab).is_some() {
        effects.push(Effect::Destroy(tab));
      }
    }
    Ok(effects)
  }

  /// Selects a space and shows the tab it last showed.
  pub fn switch_space(&mut self, id: Id, now: u64) -> Result<Vec<Effect>> {
    let tab = self.space(id)?.active_tab;
    self.session.active_space = id;
    match tab {
      Some(tab) => self.activate(tab, now),
      None => Ok(vec![Effect::Show(None)]),
    }
  }

  // ---- Memory ----

  /// Unloads background tabs idle for longer than [`IDLE_UNLOAD_MS`].
  pub fn unload_idle(&mut self, now: u64) -> Vec<Effect> {
    let idle: Vec<Id> = self
      .unloadable()
      .into_iter()
      .filter(|id| now.saturating_sub(self.session.tabs[id].last_accessed) >= IDLE_UNLOAD_MS)
      .collect();
    self.unload_tabs(&idle, false, now).unwrap_or_default()
  }

  /// Keeps at most [`MAX_LOADED_TABS`] loaded, unloading the least recently used first.
  fn enforce_limit(&mut self) -> Vec<Effect> {
    let mut candidates = self.unloadable();
    let excess = self.live.len().saturating_sub(MAX_LOADED_TABS);
    candidates.sort_by_key(|id| self.session.tabs[id].last_accessed);
    candidates.truncate(excess);
    // None of these is shown, so the selection doesn't change and `now` is unused.
    self.unload_tabs(&candidates, false, 0).unwrap_or_default()
  }

  /// Loaded tabs that may be unloaded automatically: not shown by any space, not playing audio.
  fn unloadable(&self) -> Vec<Id> {
    let shown: HashSet<Id> = self.session.spaces.iter().filter_map(|s| s.active_tab).collect();
    self.live.iter().filter(|(id, live)| !shown.contains(id) && !live.playing_audio).map(|(id, _)| *id).collect()
  }

  // ---- Internals ----

  fn alloc_id(&mut self) -> Id {
    let id = self.session.next_id;
    self.session.next_id += 1;
    id
  }

  fn touch(&mut self, id: Id, now: u64) {
    if let Some(tab) = self.session.tabs.get_mut(&id) {
      tab.last_accessed = now;
    }
    self.live.entry(id).or_default();
  }

  /// Clears `ids` from every space that shows one of them. If the active space did, selects the
  /// most recently used loaded tab it lists (Zen's select-recently-used-on-close), or none.
  fn deselect(&mut self, ids: &[Id], now: u64) -> Vec<Effect> {
    let active_space = self.session.active_space;
    let was_shown = self.active_tab().is_some_and(|t| ids.contains(&t));
    for space in &mut self.session.spaces {
      if space.active_tab.is_some_and(|t| ids.contains(&t)) {
        space.active_tab = None;
      }
    }
    if !was_shown {
      return vec![];
    }
    let space = self.active_space();
    let fallback = Self::space_tabs(space)
      .chain(self.session.swatches.iter().flatten().copied())
      .filter(|id| !ids.contains(id) && self.live.contains_key(id))
      .max_by_key(|id| self.session.tabs[id].last_accessed);
    if let Some(next) = fallback {
      self.space_mut(active_space).expect("active space exists").active_tab = Some(next);
      self.touch(next, now);
    }
    vec![Effect::Show(fallback)]
  }

  fn validate(&self, to: Location) -> Result<()> {
    match to {
      Location::Swatch { slot } if slot >= SWATCH_SLOTS => Err(format!("swatch slot {slot} out of range")),
      Location::Swatch { .. } => Ok(()),
      Location::Temp { space_id, .. } => self.space(space_id).map(|_| ()),
      Location::Pinned { space_id, folder_id, .. } => {
        let space = self.space(space_id)?;
        match folder_id {
          Some(f) if !space.pinned.iter().any(|p| matches!(p, Pinned::Folder(x) if x.id == f)) => {
            Err(format!("folder {f} not found in space {space_id}"))
          }
          _ => Ok(()),
        }
      }
    }
  }

  fn detach(&mut self, id: Id, from: Location) {
    match from {
      Location::Swatch { slot } => self.session.swatches[slot] = None,
      Location::Temp { space_id, .. } => {
        if let Ok(space) = self.space_mut(space_id) {
          space.temp.retain(|t| *t != id);
        }
      }
      Location::Pinned { space_id, folder_id: None, .. } => {
        if let Ok(space) = self.space_mut(space_id) {
          space.pinned.retain(|p| !matches!(p, Pinned::Tab { id: t } if *t == id));
        }
      }
      Location::Pinned { folder_id: Some(folder), .. } => {
        if let Ok((_, folder)) = self.folder_mut(folder) {
          folder.tabs.retain(|t| *t != id);
        }
      }
    }
  }

  /// Places a detached tab. Pinned and swatch tabs remember their URL; temp tabs forget it.
  fn attach(&mut self, id: Id, to: Location) {
    let tab = self.session.tabs.get_mut(&id).expect("attached tab exists");
    match to {
      Location::Temp { .. } => tab.pinned_url = None,
      _ => {
        tab.pinned_url.get_or_insert_with(|| tab.url.clone());
      }
    }
    match to {
      Location::Swatch { slot } => self.session.swatches[slot] = Some(id),
      Location::Temp { space_id, index } => {
        insert_at(&mut self.space_mut(space_id).expect("validated").temp, index.unwrap_or(0), id)
      }
      Location::Pinned { space_id, folder_id: None, index } => {
        let pinned = &mut self.space_mut(space_id).expect("validated").pinned;
        insert_at(pinned, index.unwrap_or(usize::MAX), Pinned::Tab { id });
      }
      Location::Pinned { folder_id: Some(folder), index, .. } => {
        let tabs = &mut self.folder_mut(folder).expect("validated").1.tabs;
        insert_at(tabs, index.unwrap_or(usize::MAX), id);
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const HOME: &str = "https://home.test/";

  fn model() -> Model {
    let mut m = Model::new(Session::new(HOME, 0));
    m.restore(0);
    m
  }

  fn space(m: &Model) -> Id {
    m.session.active_space
  }

  #[test]
  fn first_run_shows_one_temp_tab() {
    let m = model();
    let tab = m.active_tab().unwrap();
    assert_eq!(m.tab(tab).unwrap().url, HOME);
    assert!(m.live.contains_key(&tab));
    assert!(matches!(m.locate(tab), Some(Location::Temp { .. })));
  }

  #[test]
  fn open_tab_goes_on_top_and_is_selected() {
    let mut m = model();
    let (id, effects) = m.open_tab("https://a.test/".into(), 1);
    assert_eq!(effects, vec![Effect::Show(Some(id))]);
    assert_eq!(m.active_space().temp[0], id);
    assert_eq!(m.active_tab(), Some(id));
  }

  #[test]
  fn closing_temp_removes_and_selects_most_recent_loaded() {
    let mut m = model();
    let first = m.active_tab().unwrap();
    let (second, _) = m.open_tab("https://b.test/".into(), 5);
    let (third, _) = m.open_tab("https://c.test/".into(), 10);
    m.activate(second, 20).unwrap();
    m.activate(third, 30).unwrap();
    let effects = m.close_tab(third, 40).unwrap();
    assert_eq!(effects, vec![Effect::Show(Some(second)), Effect::Destroy(third)]);
    assert!(m.tab(third).is_err());
    assert!(m.tab(first).is_ok());
  }

  #[test]
  fn closing_pinned_unloads_and_resets_to_pinned_url() {
    let mut m = model();
    let tab = m.active_tab().unwrap();
    m.move_tab(tab, Location::Pinned { space_id: space(&m), folder_id: None, index: None }).unwrap();
    m.update_page(tab, Some("https://home.test/elsewhere".into()), None);
    let effects = m.close_tab(tab, 1).unwrap();
    assert_eq!(effects, vec![Effect::Show(None), Effect::Destroy(tab)]);
    assert_eq!(m.tab(tab).unwrap().url, HOME);
    assert!(!m.live.contains_key(&tab));
    assert!(matches!(m.locate(tab), Some(Location::Pinned { .. })));
  }

  #[test]
  fn unloading_keeps_the_current_page() {
    let mut m = model();
    let tab = m.active_tab().unwrap();
    m.move_tab(tab, Location::Swatch { slot: 0 }).unwrap();
    m.update_page(tab, Some("https://home.test/deep".into()), None);
    m.unload_tab(tab, 1).unwrap();
    assert_eq!(m.tab(tab).unwrap().url, "https://home.test/deep");
  }

  #[test]
  fn moving_the_shown_tab_to_another_space_follows_it() {
    let mut m = model();
    let tab = m.active_tab().unwrap();
    let work = m.create_space("Work".into(), "hammer".into());
    m.move_tab(tab, Location::Temp { space_id: work, index: None }).unwrap();
    assert_eq!(m.session.active_space, work);
    assert_eq!(m.active_tab(), Some(tab));
    assert_eq!(m.session.spaces[0].active_tab, None);
  }

  #[test]
  fn unpinning_forgets_the_pinned_url() {
    let mut m = model();
    let tab = m.active_tab().unwrap();
    let s = space(&m);
    m.move_tab(tab, Location::Swatch { slot: 3 }).unwrap();
    assert_eq!(m.tab(tab).unwrap().pinned_url.as_deref(), Some(HOME));
    m.move_tab(tab, Location::Temp { space_id: s, index: None }).unwrap();
    assert_eq!(m.tab(tab).unwrap().pinned_url, None);
    assert_eq!(m.session.swatches[3], None);
  }

  #[test]
  fn moving_into_an_occupied_swatch_swaps() {
    let mut m = model();
    let a = m.active_tab().unwrap();
    let (b, _) = m.open_tab("https://b.test/".into(), 1);
    m.move_tab(a, Location::Swatch { slot: 0 }).unwrap();
    m.move_tab(b, Location::Swatch { slot: 0 }).unwrap();
    assert_eq!(m.session.swatches[0], Some(b));
    assert!(matches!(m.locate(a), Some(Location::Temp { .. })));
  }

  #[test]
  fn trash_all_keeps_pinned_tabs() {
    let mut m = model();
    let s = space(&m);
    let pinned = m.active_tab().unwrap();
    m.move_tab(pinned, Location::Pinned { space_id: s, folder_id: None, index: None }).unwrap();
    m.open_tab("https://b.test/".into(), 1);
    m.open_tab("https://c.test/".into(), 2);
    m.clear_temp_tabs(s, 3).unwrap();
    assert!(m.active_space().temp.is_empty());
    assert_eq!(m.session.tabs.len(), 1);
    assert_eq!(m.active_tab(), Some(pinned));
  }

  #[test]
  fn folders_unpack_or_delete_their_tabs() {
    let mut m = model();
    let s = space(&m);
    let tab = m.active_tab().unwrap();
    let folder = m.create_folder(s, "F".into(), None).unwrap();
    m.move_tab(tab, Location::Pinned { space_id: s, folder_id: Some(folder), index: None }).unwrap();
    m.delete_folder(folder, true, 1).unwrap();
    assert_eq!(m.active_space().pinned, vec![Pinned::Tab { id: tab }]);

    let folder = m.create_folder(s, "G".into(), Some(0)).unwrap();
    m.move_tab(tab, Location::Pinned { space_id: s, folder_id: Some(folder), index: None }).unwrap();
    m.delete_folder(folder, false, 2).unwrap();
    assert!(m.session.tabs.is_empty());
    assert_eq!(m.active_tab(), None);
  }

  #[test]
  fn spaces_remember_their_tab_and_the_last_one_stays() {
    let mut m = model();
    let home = space(&m);
    let home_tab = m.active_tab().unwrap();
    let work = m.create_space("Work".into(), "hammer".into());
    assert_eq!(m.switch_space(work, 1).unwrap(), vec![Effect::Show(None)]);
    let (work_tab, _) = m.open_tab("https://w.test/".into(), 2);
    assert!(matches!(m.locate(work_tab), Some(Location::Temp { space_id, .. }) if space_id == work));
    assert_eq!(m.switch_space(home, 3).unwrap(), vec![Effect::Show(Some(home_tab))]);

    let effects = m.delete_space(home, 4).unwrap();
    assert!(effects.contains(&Effect::Show(Some(work_tab))));
    assert!(effects.contains(&Effect::Destroy(home_tab)));
    assert!(m.delete_space(work, 5).is_err());
  }

  #[test]
  fn loaded_tabs_are_capped_lru_first() {
    let mut m = model();
    let first = m.active_tab().unwrap();
    let mut effects = vec![];
    for i in 1..=MAX_LOADED_TABS as u64 {
      effects = m.open_tab(format!("https://{i}.test/"), i).1;
    }
    assert_eq!(m.live.len(), MAX_LOADED_TABS);
    assert!(effects.contains(&Effect::Destroy(first)));
    assert!(m.tab(first).is_ok(), "unloaded, not closed");
  }

  #[test]
  fn idle_unload_spares_the_active_and_audible_tabs() {
    let mut m = model();
    let quiet = m.active_tab().unwrap();
    let (music, _) = m.open_tab("https://music.test/".into(), 0);
    let (active, _) = m.open_tab("https://a.test/".into(), 0);
    m.live.get_mut(&music).unwrap().playing_audio = true;
    let effects = m.unload_idle(IDLE_UNLOAD_MS);
    assert_eq!(effects, vec![Effect::Destroy(quiet)]);
    assert!(m.live.contains_key(&music) && m.live.contains_key(&active));
  }

  #[test]
  fn repair_drops_dangling_and_duplicate_references() {
    let mut s = Session::new(HOME, 0);
    let tab = s.spaces[0].temp[0];
    s.swatches[0] = Some(tab);
    s.spaces[0].temp.push(999);
    s.spaces[0].active_tab = Some(999);
    s.tabs.insert(500, new_tab(500, HOME, 0));
    s.next_id = 0;
    let s = s.repaired(HOME, 0);
    assert_eq!(s.swatches[0], Some(tab));
    assert!(s.spaces[0].temp.is_empty(), "duplicate and dangling ids removed");
    assert_eq!(s.spaces[0].active_tab, None);
    assert!(!s.tabs.contains_key(&500), "orphan removed");
    assert!(s.next_id > tab);
  }

  #[test]
  fn location_serde_matches_the_contract() {
    let json = r#"{"kind":"pinned","spaceId":1,"folderId":null,"index":2}"#;
    let to: Location = serde_json::from_str(json).unwrap();
    assert_eq!(to, Location::Pinned { space_id: 1, folder_id: None, index: Some(2) });
  }
}
