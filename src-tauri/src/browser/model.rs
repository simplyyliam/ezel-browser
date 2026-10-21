//! Tabs, folders, spaces and swatches as plain data. No Tauri, no webviews: every operation edits the
//! model and returns the [`Effect`]s the runtime must apply to the native webviews, so the rules here
//! are unit-tested on their own.
//!
//! Modelled on Zen (workspaces, pinned tabs, folders, essentials) and Arc (spaces, pinned/today tabs,
//! favorites). See `docs/design/decisions.md`, "Tabs, folders and spaces".

use std::{
  cmp::Reverse,
  collections::{HashMap, HashSet},
};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::layers::PageLayer;
use crate::error::{AppError, ErrorCode};

pub type Id = u64;

// [`Id`] in the bindings (TS `Id = number`), for `#[specta(type = TsId)]` and the command boundary.
// specta refuses u64 (bigint), so u32 stands in for the type only; the value stays a u64.
/// A tab, folder or space id: a number from one shared counter, never reused.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, Type)]
#[serde(transparent, rename = "Id")]
pub struct TsId(#[specta(type = u32)] pub Id);

/// Swatches (Zen's essentials, Arc's favorites): a global grid shared by every space.
pub const SWATCH_SLOTS: usize = 8;

/// Most loaded webviews kept at once, the active one included. Beyond this the least recently used
/// background tabs are unloaded (they keep their place and reload when selected). 5, down from 8:
/// each loaded tab costs a renderer (docs/perf/results.md).
pub const MAX_LOADED_TABS: usize = 5;

/// Background tabs unused for this long are unloaded. 5 minutes, down from 30 (docs/perf/results.md).
pub const IDLE_UNLOAD_MS: u64 = 5 * 60 * 1000;

/// Background tabs hidden for this long are frozen (WebView2 `TrySuspend`): their scripts and
/// timers stop and WebView2 trims their memory, until they're shown again.
pub const SUSPEND_AFTER_MS: u64 = 30 * 1000;

/// Ctrl+Tab presses this close together continue one walk through a frozen most-recently-used list,
/// as if Ctrl were still held (the website's key-ups never reach us); a longer pause starts over.
pub const CYCLE_WINDOW_MS: u64 = 1200;

/// Most closed tabs remembered for "Reopen Closed Tab" (Ctrl+Shift+T); the oldest go first.
pub const MAX_CLOSED_TABS: usize = 25;

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
  /// Muted by the user. Kept across unloads and restarts (a new webview starts unmuted, so the
  /// runtime re-applies it); added after version 1, so older files read false.
  #[serde(default)]
  pub muted: bool,
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
  /// Recently closed tabs, the most recent last. Added after version 1 shipped: older files have none.
  #[serde(default)]
  pub closed: Vec<ClosedTab>,
}

/// A removed tab, kept so it can be reopened where it was.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClosedTab {
  pub url: String,
  pub title: Option<String>,
  pub favicon: Option<String>,
  pub pinned_url: Option<String>,
  /// Where it lived: its space (and folder) or swatch slot, and its index there.
  pub location: TabLocation,
}

/// Where a tab lives. Also the target of `move_tab`.
// specta refuses usize (bigint): `#[specta(type = u32)]` exports it as TS `number`; the value stays a usize.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename = "TabLocation", rename_all = "camelCase")]
pub enum TabLocation {
  #[serde(rename_all = "camelCase")]
  Swatch {
    #[specta(type = u32)]
    slot: usize,
  },
  /// `folder_id: None` = the space's pinned list itself. `index: None` = the end.
  #[serde(rename_all = "camelCase")]
  Pinned {
    #[specta(type = TsId)]
    space_id: Id,
    #[specta(type = Option<TsId>)]
    folder_id: Option<Id>,
    #[specta(type = Option<u32>)]
    index: Option<usize>,
  },
  /// `index: None` = the top (newest first).
  #[serde(rename_all = "camelCase")]
  Temp {
    #[specta(type = TsId)]
    space_id: Id,
    #[specta(type = Option<u32>)]
    index: Option<usize>,
  },
}

/// What the runtime must do to the native webviews after an operation.
#[derive(Clone, Debug, PartialEq)]
pub enum Effect {
  /// Make this the visible tab, creating its webview at `Tab::url` if it isn't loaded. `None` = no tab.
  Show(Option<Id>),
  /// Close the tab's webview (unload or close).
  Destroy(Id),
  Navigate(Id, String),
  /// Mute or unmute the tab's loaded webview.
  SetMuted(Id, bool),
  /// Add (`true`) or remove a page layer in the tab's page (see `layers.rs`).
  Layer(Id, PageLayer, bool),
  /// Freeze a hidden background tab (WebView2 `TrySuspend`); showing it resumes it.
  Suspend(Id),
}

/// Per-tab runtime state of a loaded tab (has a webview). Never persisted.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Live {
  pub is_loading: bool,
  pub can_go_back: bool,
  pub can_go_forward: bool,
  pub playing_audio: bool,
  /// Page layers on (lenses), in a fixed order. Only the shown tab has any: switching tabs turns
  /// them off, and a new webview starts without.
  pub layers: Vec<PageLayer>,
  /// Frozen by [`Model::suspend_idle`]; cleared when the tab is selected again.
  pub suspended: bool,
  /// Opened by a page (a link or `window.open`), so its first address may be the page's own
  /// `blob:` URL (`url_policy::is_allowed_from_page`). Never persisted: a restored tab, or one
  /// reloaded after unloading, gets the strict rule.
  pub opened_by_page: bool,
}

pub type Result<T> = std::result::Result<T, AppError>;

/// A Ctrl+Tab walk in progress: the space's tabs, most recently used first, frozen at the first press.
#[derive(Clone, Debug, PartialEq)]
pub struct Cycle {
  space: Id,
  order: Vec<Id>,
  index: usize,
  at: u64,
}

pub struct Model {
  pub session: Session,
  /// Loaded tabs. The model decides what's loaded; the runtime makes the webviews match.
  pub live: HashMap<Id, Live>,
  /// The Ctrl+Tab walk, if one is running. Never persisted.
  cycle: Option<Cycle>,
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
      closed: vec![],
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
    // Closed tabs point at places that may be gone; reopening checks them, so only the length matters.
    let excess = self.closed.len().saturating_sub(MAX_CLOSED_TABS);
    self.closed.drain(..excess);
    self
  }
}

/// A "dev tab": its page is served from this machine (`localhost`, `127.0.0.1`, `[::1]` or any
/// `*.localhost`, any port). Dev tabs are never unloaded automatically: a build under review keeps
/// its state (forms, scroll, HMR connection) however long it sits in the background.
pub fn is_dev_url(url: &str) -> bool {
  let Some((_, rest)) = url.split_once("://") else { return false };
  let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
  let host_port = authority.rsplit_once('@').map_or(authority, |(_, h)| h);
  let host = if host_port.starts_with('[') {
    host_port.split_inclusive(']').next().unwrap_or("")
  } else {
    host_port.split(':').next().unwrap_or("")
  };
  let host = host.trim_end_matches('.').to_ascii_lowercase();
  host == "localhost" || host == "127.0.0.1" || host == "[::1]" || host.ends_with(".localhost")
}

/// Inserts at `index`, clamped to the end.
fn insert_at<T>(list: &mut Vec<T>, index: usize, item: T) {
  list.insert(index.min(list.len()), item);
}

fn new_tab(id: Id, url: &str, now: u64) -> Tab {
  Tab { id, url: url.into(), title: None, favicon: None, pinned_url: None, last_accessed: now, muted: false }
}

impl Model {
  /// A restored session starts with nothing loaded; [`Model::restore`] loads only the active tab.
  pub fn new(session: Session) -> Self {
    Model { session, live: HashMap::new(), cycle: None }
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
    self.session.tabs.get(&id).ok_or_else(|| AppError::not_found(format!("tab {id} not found")))
  }

  fn space(&self, id: Id) -> Result<&Space> {
    self.session.spaces.iter().find(|s| s.id == id).ok_or_else(|| AppError::not_found(format!("space {id} not found")))
  }

  fn space_mut(&mut self, id: Id) -> Result<&mut Space> {
    self.session.spaces.iter_mut().find(|s| s.id == id).ok_or_else(|| AppError::not_found(format!("space {id} not found")))
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
      .ok_or_else(|| AppError::not_found(format!("folder {id} not found")))
  }

  /// Where the tab lives. A linear scan: tab counts are small, and one source of truth beats a
  /// reverse index that can drift out of sync.
  pub fn locate(&self, id: Id) -> Option<TabLocation> {
    if let Some(slot) = self.session.swatches.iter().position(|s| *s == Some(id)) {
      return Some(TabLocation::Swatch { slot });
    }
    for space in &self.session.spaces {
      if let Some(index) = space.temp.iter().position(|t| *t == id) {
        return Some(TabLocation::Temp { space_id: space.id, index: Some(index) });
      }
      for (i, item) in space.pinned.iter().enumerate() {
        match item {
          Pinned::Tab { id: t } if *t == id => {
            return Some(TabLocation::Pinned { space_id: space.id, folder_id: None, index: Some(i) })
          }
          Pinned::Folder(f) => {
            if let Some(index) = f.tabs.iter().position(|t| *t == id) {
              return Some(TabLocation::Pinned { space_id: space.id, folder_id: Some(f.id), index: Some(index) });
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

  /// [`Model::open_tab`] for a tab a page opens (`target=_blank`, `window.open`): marked so its
  /// webview may start at the page's own `blob:` URL.
  pub fn open_tab_from_page(&mut self, url: String, now: u64) -> (Id, Vec<Effect>) {
    let (id, effects) = self.open_tab(url, now);
    if let Some(live) = self.live.get_mut(&id) {
      live.opened_by_page = true;
    }
    (id, effects)
  }

  /// Selects a tab: it becomes its space's active tab, and that space becomes active.
  /// A swatch stays in the current space.
  pub fn activate(&mut self, id: Id, now: u64) -> Result<Vec<Effect>> {
    let space = match self.locate(id).ok_or_else(|| AppError::not_found(format!("tab {id} not found")))? {
      TabLocation::Swatch { .. } => self.session.active_space,
      TabLocation::Pinned { space_id, .. } | TabLocation::Temp { space_id, .. } => space_id,
    };
    self.session.active_space = space;
    self.space_mut(space)?.active_tab = Some(id);
    self.touch(id, now);
    let mut effects = vec![Effect::Show(Some(id))];
    effects.extend(self.drop_layers_except(Some(id)));
    effects.extend(self.enforce_limit());
    Ok(effects)
  }

  /// Turns a page layer (a lens) on or off in the shown tab. Returns whether it's now on.
  pub fn toggle_layer(&mut self, layer: PageLayer) -> Result<(bool, Vec<Effect>)> {
    let no_tab = || AppError::new(ErrorCode::NoTabShown, "no tab is shown");
    let id = self.active_tab().ok_or_else(no_tab)?;
    let live = self.live.get_mut(&id).ok_or_else(no_tab)?;
    let on = match live.layers.iter().position(|l| *l == layer) {
      Some(i) => {
        live.layers.remove(i);
        false
      }
      None => {
        live.layers.push(layer);
        live.layers.sort();
        true
      }
    };
    Ok((on, vec![Effect::Layer(id, layer, on)]))
  }

  /// Lenses belong to the tab they were turned on in while it's on screen: every other tab's go.
  fn drop_layers_except(&mut self, keep: Option<Id>) -> Vec<Effect> {
    let mut ids: Vec<Id> = self.live.iter().filter(|(id, l)| Some(**id) != keep && !l.layers.is_empty()).map(|(id, _)| *id).collect();
    ids.sort();
    let mut effects = vec![];
    for id in ids {
      let layers = std::mem::take(&mut self.live.get_mut(&id).expect("listed above").layers);
      effects.extend(layers.into_iter().map(|layer| Effect::Layer(id, layer, false)));
    }
    effects
  }

  /// Ctrl+Tab (`backward`: Ctrl+Shift+Tab): selects the next tab of the active space in
  /// most-recently-used order. Presses within [`CYCLE_WINDOW_MS`] of each other walk deeper into the
  /// same frozen order (Firefox's "Ctrl+Tab cycles through tabs in recently used order"); after a
  /// pause, a press goes back to the previous tab. A swatch shown in the space starts the walk too.
  pub fn cycle_tab(&mut self, backward: bool, now: u64) -> Result<Vec<Effect>> {
    let space = self.session.active_space;
    let active = self.active_tab();
    let continues = self.cycle.as_ref().is_some_and(|c| {
      c.space == space
        && now.saturating_sub(c.at) <= CYCLE_WINDOW_MS
        && active == c.order.get(c.index).copied()
        && c.order.iter().all(|id| self.session.tabs.contains_key(id))
    });
    if !continues {
      let mut order: Vec<Id> = Self::space_tabs(self.active_space()).collect();
      // Stable: tabs never selected since a restore keep their sidebar order.
      order.sort_by_key(|id| Reverse(self.session.tabs[id].last_accessed));
      if let Some(active) = active {
        order.retain(|id| *id != active);
        order.insert(0, active);
      }
      self.cycle = Some(Cycle { space, order, index: 0, at: now });
    }
    let cycle = self.cycle.as_mut().expect("set above");
    let len = cycle.order.len();
    if len == 0 {
      return Ok(vec![]);
    }
    cycle.index = match (active == Some(cycle.order[cycle.index]), backward) {
      // Nothing shown yet: forward starts at the most recent tab, backward at the least.
      (false, false) => 0,
      (false, true) => len - 1,
      (true, false) => (cycle.index + 1) % len,
      (true, true) => (cycle.index + len - 1) % len,
    };
    cycle.at = now;
    let next = cycle.order[cycle.index];
    if Some(next) == active {
      return Ok(vec![]);
    }
    self.activate(next, now)
  }

  /// Zen/Arc close: a temp tab is removed; a pinned or swatch tab only unloads (it keeps its place).
  pub fn close_tab(&mut self, id: Id, now: u64) -> Result<Vec<Effect>> {
    match self.locate(id) {
      Some(TabLocation::Temp { .. }) => self.remove_tab(id, now),
      Some(_) => self.unload_tabs(&[id], true, now),
      None => Err(AppError::not_found(format!("tab {id} not found"))),
    }
  }

  /// Removes a tab from wherever it lives. It goes on the closed-tab stack.
  pub fn remove_tab(&mut self, id: Id, now: u64) -> Result<Vec<Effect>> {
    let location = self.locate(id).ok_or_else(|| AppError::not_found(format!("tab {id} not found")))?;
    let mut effects = self.deselect(&[id], now);
    self.remember_closed(id, location);
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
  pub fn move_tab(&mut self, id: Id, to: TabLocation) -> Result<()> {
    let from = self.locate(id).ok_or_else(|| AppError::not_found(format!("tab {id} not found")))?;
    self.validate(to)?;
    self.detach(id, from);
    if let TabLocation::Swatch { slot } = to {
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
  fn follow_moved_tab(&mut self, id: Id, to: TabLocation) {
    let (TabLocation::Pinned { space_id: dest, .. } | TabLocation::Temp { space_id: dest, .. }) = to else { return };
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
    let url = tab.pinned_url.clone().ok_or_else(|| AppError::new(ErrorCode::NotPinned, format!("tab {id} is not pinned")))?;
    if self.live.contains_key(&id) {
      return Ok(vec![Effect::Navigate(id, url)]);
    }
    self.session.tabs.get_mut(&id).expect("checked above").url = url;
    Ok(vec![])
  }

  /// Mutes or unmutes a tab. A loaded tab's webview follows now; an unloaded one when it loads.
  pub fn set_muted(&mut self, id: Id, muted: bool) -> Result<Vec<Effect>> {
    let tab = self.session.tabs.get_mut(&id).ok_or_else(|| AppError::not_found(format!("tab {id} not found")))?;
    tab.muted = muted;
    Ok(if self.live.contains_key(&id) { vec![Effect::SetMuted(id, muted)] } else { vec![] })
  }

  /// Makes the tab's current URL its pinned URL.
  pub fn update_pinned_url(&mut self, id: Id) -> Result<()> {
    let tab = self.session.tabs.get_mut(&id).ok_or_else(|| AppError::not_found(format!("tab {id} not found")))?;
    if tab.pinned_url.is_none() {
      return Err(AppError::new(ErrorCode::NotPinned, format!("tab {id} is not pinned")));
    }
    tab.pinned_url = Some(tab.url.clone());
    Ok(())
  }

  /// Trash-all: removes the space's temp tabs only. They go on the closed-tab stack bottom first, so
  /// reopening brings back the top one first and each lands at its old index.
  pub fn clear_temp_tabs(&mut self, space_id: Id, now: u64) -> Result<Vec<Effect>> {
    let ids = self.space(space_id)?.temp.clone();
    let mut effects = self.deselect(&ids, now);
    for (index, id) in ids.iter().enumerate().rev() {
      self.remember_closed(*id, TabLocation::Temp { space_id, index: Some(index) });
    }
    self.space_mut(space_id)?.temp.clear();
    for id in ids {
      self.session.tabs.remove(&id);
      if self.live.remove(&id).is_some() {
        effects.push(Effect::Destroy(id));
      }
    }
    Ok(effects)
  }

  /// Ctrl+Shift+T: brings back the most recently closed tab where it was (its space, folder or
  /// swatch slot, at its old index or the end if the list got shorter) and selects it. A place that
  /// no longer exists falls back to the end of the same list in its space, then to the active
  /// space. `None` when nothing is left to reopen.
  pub fn reopen_closed_tab(&mut self, now: u64) -> Result<Option<(Id, Vec<Effect>)>> {
    let Some(closed) = self.session.closed.pop() else { return Ok(None) };
    let to = self.reopen_location(closed.location);
    let id = self.alloc_id();
    let tab = Tab { title: closed.title, favicon: closed.favicon, pinned_url: closed.pinned_url, ..new_tab(id, &closed.url, now) };
    self.session.tabs.insert(id, tab);
    self.attach(id, to);
    Ok(Some((id, self.activate(id, now)?)))
  }

  /// Where a closed tab goes back to, given what still exists.
  fn reopen_location(&self, was: TabLocation) -> TabLocation {
    let space_of = |space_id: Id| if self.space(space_id).is_ok() { space_id } else { self.session.active_space };
    match was {
      TabLocation::Swatch { slot } => {
        let free = |s: usize| self.session.swatches.get(s).is_some_and(|x| x.is_none());
        match (0..SWATCH_SLOTS).find(|s| *s == slot && free(*s)).or_else(|| (0..SWATCH_SLOTS).find(|s| free(*s))) {
          Some(slot) => TabLocation::Swatch { slot },
          // The grid filled up meanwhile: it comes back as a temp tab on top of the active space.
          None => TabLocation::Temp { space_id: self.session.active_space, index: Some(0) },
        }
      }
      TabLocation::Temp { space_id, index } => TabLocation::Temp { space_id: space_of(space_id), index },
      TabLocation::Pinned { space_id, folder_id, index } => {
        let folder_alive = folder_id.is_some()
          && self.validate(TabLocation::Pinned { space_id, folder_id, index: None }).is_ok();
        if folder_alive {
          TabLocation::Pinned { space_id, folder_id, index }
        } else if folder_id.is_some() {
          // Its folder is gone: the end of its space's pinned list.
          TabLocation::Pinned { space_id: space_of(space_id), folder_id: None, index: None }
        } else {
          TabLocation::Pinned { space_id: space_of(space_id), folder_id: None, index }
        }
      }
    }
  }

  /// Pushes a tab that's about to be removed onto the closed-tab stack.
  fn remember_closed(&mut self, id: Id, location: TabLocation) {
    let Some(tab) = self.session.tabs.get(&id) else { return };
    self.session.closed.push(ClosedTab {
      url: tab.url.clone(),
      title: tab.title.clone(),
      favicon: tab.favicon.clone(),
      pinned_url: tab.pinned_url.clone(),
      location,
    });
    let excess = self.session.closed.len().saturating_sub(MAX_CLOSED_TABS);
    self.session.closed.drain(..excess);
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
    Err(AppError::not_found(format!("folder {id} not found")))
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
    let from = self.session.spaces.iter().position(|s| s.id == id).ok_or_else(|| AppError::not_found(format!("space {id} not found")))?;
    let space = self.session.spaces.remove(from);
    insert_at(&mut self.session.spaces, index, space);
    Ok(())
  }

  /// Deletes a space and all its tabs. The last space can't be deleted.
  pub fn delete_space(&mut self, id: Id, now: u64) -> Result<Vec<Effect>> {
    if self.session.spaces.len() == 1 {
      return Err(AppError::new(ErrorCode::LastSpace, "can't delete the last space"));
    }
    let index = self.session.spaces.iter().position(|s| s.id == id).ok_or_else(|| AppError::not_found(format!("space {id} not found")))?;
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
      None => {
        let mut effects = vec![Effect::Show(None)];
        effects.extend(self.drop_layers_except(None));
        Ok(effects)
      }
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

  /// Freezes background tabs hidden for longer than [`SUSPEND_AFTER_MS`] (the same tabs
  /// [`Model::unload_idle`] may unload: never the shown tab, dev tabs or tabs playing audio).
  pub fn suspend_idle(&mut self, now: u64) -> Vec<Effect> {
    let mut idle: Vec<Id> = self
      .unloadable()
      .into_iter()
      .filter(|id| !self.live[id].suspended && now.saturating_sub(self.session.tabs[id].last_accessed) >= SUSPEND_AFTER_MS)
      .collect();
    idle.sort();
    for id in &idle {
      self.live.get_mut(id).expect("loaded").suspended = true;
    }
    idle.into_iter().map(Effect::Suspend).collect()
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

  /// Loaded tabs that may be unloaded automatically: not shown by any space, not playing audio,
  /// not a dev tab ([`is_dev_url`]). People can still unload any of them by hand.
  fn unloadable(&self) -> Vec<Id> {
    let shown: HashSet<Id> = self.session.spaces.iter().filter_map(|s| s.active_tab).collect();
    let dev = |id: &Id| self.session.tabs.get(id).is_some_and(|t| is_dev_url(&t.url));
    self
      .live
      .iter()
      .filter(|(id, live)| !shown.contains(id) && !live.playing_audio && !dev(id))
      .map(|(id, _)| *id)
      .collect()
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
    // Selected again: it's shown, so it isn't frozen any more (the runtime resumes it).
    self.live.entry(id).or_default().suspended = false;
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

  fn validate(&self, to: TabLocation) -> Result<()> {
    match to {
      TabLocation::Swatch { slot } if slot >= SWATCH_SLOTS => Err(AppError::invalid_input(format!("swatch slot {slot} out of range"))),
      TabLocation::Swatch { .. } => Ok(()),
      TabLocation::Temp { space_id, .. } => self.space(space_id).map(|_| ()),
      TabLocation::Pinned { space_id, folder_id, .. } => {
        let space = self.space(space_id)?;
        match folder_id {
          Some(f) if !space.pinned.iter().any(|p| matches!(p, Pinned::Folder(x) if x.id == f)) => {
            Err(AppError::not_found(format!("folder {f} not found in space {space_id}")))
          }
          _ => Ok(()),
        }
      }
    }
  }

  fn detach(&mut self, id: Id, from: TabLocation) {
    match from {
      TabLocation::Swatch { slot } => self.session.swatches[slot] = None,
      TabLocation::Temp { space_id, .. } => {
        if let Ok(space) = self.space_mut(space_id) {
          space.temp.retain(|t| *t != id);
        }
      }
      TabLocation::Pinned { space_id, folder_id: None, .. } => {
        if let Ok(space) = self.space_mut(space_id) {
          space.pinned.retain(|p| !matches!(p, Pinned::Tab { id: t } if *t == id));
        }
      }
      TabLocation::Pinned { folder_id: Some(folder), .. } => {
        if let Ok((_, folder)) = self.folder_mut(folder) {
          folder.tabs.retain(|t| *t != id);
        }
      }
    }
  }

  /// Places a detached tab. Pinned and swatch tabs remember their URL; temp tabs forget it.
  fn attach(&mut self, id: Id, to: TabLocation) {
    let tab = self.session.tabs.get_mut(&id).expect("attached tab exists");
    match to {
      TabLocation::Temp { .. } => tab.pinned_url = None,
      _ => {
        tab.pinned_url.get_or_insert_with(|| tab.url.clone());
      }
    }
    match to {
      TabLocation::Swatch { slot } => self.session.swatches[slot] = Some(id),
      TabLocation::Temp { space_id, index } => {
        insert_at(&mut self.space_mut(space_id).expect("validated").temp, index.unwrap_or(0), id)
      }
      TabLocation::Pinned { space_id, folder_id: None, index } => {
        let pinned = &mut self.space_mut(space_id).expect("validated").pinned;
        insert_at(pinned, index.unwrap_or(usize::MAX), Pinned::Tab { id });
      }
      TabLocation::Pinned { folder_id: Some(folder), index, .. } => {
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
    assert!(matches!(m.locate(tab), Some(TabLocation::Temp { .. })));
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
    m.move_tab(tab, TabLocation::Pinned { space_id: space(&m), folder_id: None, index: None }).unwrap();
    m.update_page(tab, Some("https://home.test/elsewhere".into()), None);
    let effects = m.close_tab(tab, 1).unwrap();
    assert_eq!(effects, vec![Effect::Show(None), Effect::Destroy(tab)]);
    assert_eq!(m.tab(tab).unwrap().url, HOME);
    assert!(!m.live.contains_key(&tab));
    assert!(matches!(m.locate(tab), Some(TabLocation::Pinned { .. })));
  }

  #[test]
  fn unloading_keeps_the_current_page() {
    let mut m = model();
    let tab = m.active_tab().unwrap();
    m.move_tab(tab, TabLocation::Swatch { slot: 0 }).unwrap();
    m.update_page(tab, Some("https://home.test/deep".into()), None);
    m.unload_tab(tab, 1).unwrap();
    assert_eq!(m.tab(tab).unwrap().url, "https://home.test/deep");
  }

  #[test]
  fn moving_the_shown_tab_to_another_space_follows_it() {
    let mut m = model();
    let tab = m.active_tab().unwrap();
    let work = m.create_space("Work".into(), "hammer".into());
    m.move_tab(tab, TabLocation::Temp { space_id: work, index: None }).unwrap();
    assert_eq!(m.session.active_space, work);
    assert_eq!(m.active_tab(), Some(tab));
    assert_eq!(m.session.spaces[0].active_tab, None);
  }

  #[test]
  fn unpinning_forgets_the_pinned_url() {
    let mut m = model();
    let tab = m.active_tab().unwrap();
    let s = space(&m);
    m.move_tab(tab, TabLocation::Swatch { slot: 3 }).unwrap();
    assert_eq!(m.tab(tab).unwrap().pinned_url.as_deref(), Some(HOME));
    m.move_tab(tab, TabLocation::Temp { space_id: s, index: None }).unwrap();
    assert_eq!(m.tab(tab).unwrap().pinned_url, None);
    assert_eq!(m.session.swatches[3], None);
  }

  #[test]
  fn moving_into_an_occupied_swatch_swaps() {
    let mut m = model();
    let a = m.active_tab().unwrap();
    let (b, _) = m.open_tab("https://b.test/".into(), 1);
    m.move_tab(a, TabLocation::Swatch { slot: 0 }).unwrap();
    m.move_tab(b, TabLocation::Swatch { slot: 0 }).unwrap();
    assert_eq!(m.session.swatches[0], Some(b));
    assert!(matches!(m.locate(a), Some(TabLocation::Temp { .. })));
  }

  #[test]
  fn trash_all_keeps_pinned_tabs() {
    let mut m = model();
    let s = space(&m);
    let pinned = m.active_tab().unwrap();
    m.move_tab(pinned, TabLocation::Pinned { space_id: s, folder_id: None, index: None }).unwrap();
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
    m.move_tab(tab, TabLocation::Pinned { space_id: s, folder_id: Some(folder), index: None }).unwrap();
    m.delete_folder(folder, true, 1).unwrap();
    assert_eq!(m.active_space().pinned, vec![Pinned::Tab { id: tab }]);

    let folder = m.create_folder(s, "G".into(), Some(0)).unwrap();
    m.move_tab(tab, TabLocation::Pinned { space_id: s, folder_id: Some(folder), index: None }).unwrap();
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
    assert!(matches!(m.locate(work_tab), Some(TabLocation::Temp { space_id, .. }) if space_id == work));
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

  /// Three temp tabs in the active space, selected a, b, c in that order (c shown).
  fn three_tabs() -> (Model, Id, Id, Id) {
    let mut m = model();
    let a = m.active_tab().unwrap();
    let (b, _) = m.open_tab("https://b.test/".into(), 10);
    let (c, _) = m.open_tab("https://c.test/".into(), 20);
    (m, a, b, c)
  }

  #[test]
  fn ctrl_tab_walks_recently_used_order_while_presses_are_close() {
    let (mut m, a, b, c) = three_tabs();
    m.cycle_tab(false, 100).unwrap();
    assert_eq!(m.active_tab(), Some(b));
    m.cycle_tab(false, 100 + CYCLE_WINDOW_MS).unwrap();
    assert_eq!(m.active_tab(), Some(a), "keeps walking deeper, not back to c");
    m.cycle_tab(false, 100 + 2 * CYCLE_WINDOW_MS).unwrap();
    assert_eq!(m.active_tab(), Some(c), "wraps around");
  }

  #[test]
  fn ctrl_tab_after_a_pause_returns_to_the_previous_tab() {
    let (mut m, _, b, c) = three_tabs();
    m.cycle_tab(false, 100).unwrap();
    assert_eq!(m.active_tab(), Some(b));
    m.cycle_tab(false, 100 + CYCLE_WINDOW_MS + 1).unwrap();
    assert_eq!(m.active_tab(), Some(c), "a fresh walk: b is now the most recent");
  }

  #[test]
  fn ctrl_shift_tab_walks_backwards_and_selecting_a_tab_restarts_the_walk() {
    let (mut m, a, b, c) = three_tabs();
    m.cycle_tab(true, 100).unwrap();
    assert_eq!(m.active_tab(), Some(a), "backward from c reaches the least recently used first");
    m.cycle_tab(true, 200).unwrap();
    assert_eq!(m.active_tab(), Some(b));
    m.activate(c, 300).unwrap();
    m.cycle_tab(false, 400).unwrap();
    assert_eq!(m.active_tab(), Some(b), "a click in between starts a new walk");
  }

  #[test]
  fn ctrl_tab_stays_in_the_active_space() {
    let (mut m, _, _, c) = three_tabs();
    let work = m.create_space("Work".into(), "hammer".into());
    m.switch_space(work, 30).unwrap();
    let (w, _) = m.open_tab("https://w.test/".into(), 40);
    assert_eq!(m.cycle_tab(false, 50).unwrap(), vec![], "the only tab: nothing to switch to");
    assert_eq!(m.active_tab(), Some(w));
    assert_ne!(m.active_tab(), Some(c));
  }

  #[test]
  fn ctrl_tab_from_a_swatch_moves_into_the_space() {
    let (mut m, _, b, c) = three_tabs();
    m.move_tab(b, TabLocation::Swatch { slot: 0 }).unwrap();
    m.activate(b, 30).unwrap();
    m.cycle_tab(false, 40).unwrap();
    assert_eq!(m.active_tab(), Some(c));
  }

  #[test]
  fn closing_temp_tabs_can_be_reopened_in_place_newest_first() {
    let (mut m, a, b, c) = three_tabs();
    let s = space(&m);
    m.update_page(b, None, Some(Some("Bee".into())));
    // Temp list, newest first: c, b, a. Close b (index 1), then c (index 0).
    m.close_tab(b, 30).unwrap();
    m.close_tab(c, 40).unwrap();
    assert_eq!(m.session.closed.len(), 2);

    let (c2, effects) = m.reopen_closed_tab(50).unwrap().unwrap();
    assert_eq!(effects[0], Effect::Show(Some(c2)));
    assert_eq!(m.tab(c2).unwrap().url, "https://c.test/");
    let (b2, _) = m.reopen_closed_tab(60).unwrap().unwrap();
    assert_eq!(m.tab(b2).unwrap().title.as_deref(), Some("Bee"));
    assert_eq!(m.active_space().temp, vec![c2, b2, a], "back at their old indices");
    assert_eq!(m.active_tab(), Some(b2));
    assert_eq!(m.session.active_space, s);
    assert!(m.reopen_closed_tab(70).unwrap().is_none(), "the stack is empty");
  }

  #[test]
  fn unloading_a_pinned_tab_is_not_a_close_but_removing_it_is() {
    let mut m = model();
    let s = space(&m);
    let tab = m.active_tab().unwrap();
    m.move_tab(tab, TabLocation::Pinned { space_id: s, folder_id: None, index: None }).unwrap();
    m.close_tab(tab, 1).unwrap();
    assert!(m.session.closed.is_empty(), "closing a pinned tab only unloads it");

    m.remove_tab(tab, 2).unwrap();
    let (back, _) = m.reopen_closed_tab(3).unwrap().unwrap();
    assert_eq!(m.locate(back), Some(TabLocation::Pinned { space_id: s, folder_id: None, index: Some(0) }));
    assert_eq!(m.tab(back).unwrap().pinned_url.as_deref(), Some(HOME), "keeps its pinned URL");
  }

  #[test]
  fn trash_all_pushes_every_temp_tab_and_reopens_the_top_one_first() {
    let (mut m, a, b, c) = three_tabs();
    let urls = |m: &Model| m.active_space().temp.iter().map(|id| m.tab(*id).unwrap().url.clone()).collect::<Vec<_>>();
    let before: Vec<String> = [c, b, a].iter().map(|id| m.tab(*id).unwrap().url.clone()).collect();
    m.clear_temp_tabs(space(&m), 30).unwrap();
    assert_eq!(m.session.closed.len(), 3);
    let (first, _) = m.reopen_closed_tab(40).unwrap().unwrap();
    assert_eq!(m.tab(first).unwrap().url, before[0]);
    m.reopen_closed_tab(50).unwrap();
    m.reopen_closed_tab(60).unwrap();
    assert_eq!(urls(&m), before, "same order as before the trash-all");
  }

  #[test]
  fn reopening_falls_back_when_the_place_is_gone() {
    let mut m = model();
    let home = space(&m);
    let tab = m.active_tab().unwrap();
    let work = m.create_space("Work".into(), "hammer".into());
    let folder = m.create_folder(work, "F".into(), None).unwrap();
    m.move_tab(tab, TabLocation::Pinned { space_id: work, folder_id: Some(folder), index: None }).unwrap();
    m.remove_tab(tab, 1).unwrap();
    m.delete_folder(folder, true, 2).unwrap();
    let (back, _) = m.reopen_closed_tab(3).unwrap().unwrap();
    assert_eq!(m.locate(back), Some(TabLocation::Pinned { space_id: work, folder_id: None, index: Some(0) }), "folder gone: its space's list");

    m.remove_tab(back, 4).unwrap();
    m.switch_space(home, 5).unwrap();
    m.delete_space(work, 6).unwrap();
    let (again, _) = m.reopen_closed_tab(7).unwrap().unwrap();
    assert!(matches!(m.locate(again), Some(TabLocation::Pinned { space_id, .. }) if space_id == home), "space gone: the active space");

    let (other, _) = m.open_tab("https://o.test/".into(), 8);
    m.move_tab(other, TabLocation::Swatch { slot: 2 }).unwrap();
    m.remove_tab(other, 9).unwrap();
    let (swatch, _) = m.reopen_closed_tab(10).unwrap().unwrap();
    assert_eq!(m.session.swatches[2], Some(swatch), "its own swatch slot");
  }

  #[test]
  fn the_closed_stack_keeps_the_newest_25() {
    let mut m = model();
    for i in 0..(MAX_CLOSED_TABS as u64 + 5) {
      let (id, _) = m.open_tab(format!("https://{i}.test/"), i);
      m.close_tab(id, i).unwrap();
    }
    assert_eq!(m.session.closed.len(), MAX_CLOSED_TABS);
    assert_eq!(m.session.closed[0].url, "https://5.test/", "the oldest five were dropped");
  }

  #[test]
  fn closed_tabs_persist_and_old_sessions_still_load() {
    let (mut m, _, b, _) = three_tabs();
    m.close_tab(b, 30).unwrap();
    let json = serde_json::to_string(&m.session).unwrap();
    let back: Session = serde_json::from_str(&json).unwrap();
    assert_eq!(back.closed, m.session.closed);

    let mut value = serde_json::to_value(&m.session).unwrap();
    value.as_object_mut().unwrap().remove("closed");
    let old: Session = serde_json::from_value(value).unwrap();
    assert!(old.closed.is_empty(), "a file from before the stack existed");
  }

  #[test]
  fn muting_follows_the_webview_and_survives_unloading() {
    let (mut m, a, _, c) = three_tabs();
    assert_eq!(m.set_muted(c, true).unwrap(), vec![Effect::SetMuted(c, true)], "loaded: applied now");
    m.unload_tab(a, 30).unwrap();
    assert_eq!(m.set_muted(a, true).unwrap(), vec![], "unloaded: applied when it loads");
    assert!(m.tab(a).unwrap().muted);
    m.unload_tab(c, 40).unwrap();
    assert!(m.tab(c).unwrap().muted, "unloading keeps the mute");
    assert_eq!(m.set_muted(c, false).unwrap(), vec![]);
    assert!(!m.tab(c).unwrap().muted);
    assert!(m.set_muted(999, true).is_err());
  }

  #[test]
  fn tabs_saved_before_mute_existed_load_unmuted() {
    let json = r#"{"id":5,"url":"https://a.test/","title":null,"favicon":null,"pinnedUrl":null,"lastAccessed":0}"#;
    let tab: Tab = serde_json::from_str(json).unwrap();
    assert!(!tab.muted);
  }

  #[test]
  fn dev_urls_are_the_ones_served_from_this_machine() {
    for url in [
      "http://localhost:5173/",
      "https://localhost",
      "http://LOCALHOST:3000/a?b#c",
      "http://127.0.0.1:8080/",
      "http://[::1]:4000/",
      "http://app.localhost:1420/",
      "http://user:pw@localhost:9000/",
      "http://localhost./",
    ] {
      assert!(is_dev_url(url), "{url}");
    }
    for url in [
      "https://example.com/",
      "https://localhost.example.com/",
      "https://notlocalhost/",
      "https://127.0.0.2/",
      "https://example.com/?next=http://localhost",
      "https://example.com/#localhost",
      "about:blank",
      "localhost:5173",
      "",
    ] {
      assert!(!is_dev_url(url), "{url}");
    }
  }

  #[test]
  fn idle_unload_never_unloads_a_dev_tab() {
    let mut m = model();
    let quiet = m.active_tab().unwrap();
    let (dev, _) = m.open_tab("http://localhost:5173/".into(), 0);
    m.open_tab("https://a.test/".into(), 0);
    let effects = m.unload_idle(IDLE_UNLOAD_MS * 10);
    assert_eq!(effects, vec![Effect::Destroy(quiet)]);
    assert!(m.live.contains_key(&dev));
  }

  #[test]
  fn the_loaded_tab_cap_skips_dev_tabs() {
    let mut m = model();
    let first = m.active_tab().unwrap();
    m.update_page(first, Some("http://app.localhost:1420/".into()), None);
    let (second, _) = m.open_tab("https://second.test/".into(), 1);
    let mut effects = vec![];
    for i in 2..=MAX_LOADED_TABS as u64 {
      effects = m.open_tab(format!("https://{i}.test/"), i).1;
    }
    assert!(m.live.contains_key(&first), "the oldest tab is a dev tab: kept");
    assert!(effects.contains(&Effect::Destroy(second)), "the next least recently used goes instead");
    assert_eq!(m.live.len(), MAX_LOADED_TABS);
    assert!(m.unload_tab(first, 100).unwrap().contains(&Effect::Destroy(first)), "by hand it still unloads");
  }

  #[test]
  fn lenses_toggle_on_the_shown_tab() {
    let (mut m, _, _, c) = three_tabs();
    assert_eq!(m.toggle_layer(PageLayer::Squint).unwrap(), (true, vec![Effect::Layer(c, PageLayer::Squint, true)]));
    m.toggle_layer(PageLayer::Greyscale).unwrap();
    assert_eq!(m.live[&c].layers, vec![PageLayer::Squint, PageLayer::Greyscale], "they stack");
    assert_eq!(m.toggle_layer(PageLayer::Squint).unwrap(), (false, vec![Effect::Layer(c, PageLayer::Squint, false)]));
    assert_eq!(m.live[&c].layers, vec![PageLayer::Greyscale]);
  }

  #[test]
  fn switching_tabs_turns_lenses_off() {
    let (mut m, a, b, c) = three_tabs();
    m.toggle_layer(PageLayer::Squint).unwrap();
    m.toggle_layer(PageLayer::Greyscale).unwrap();
    let effects = m.activate(b, 30).unwrap();
    assert!(effects.contains(&Effect::Layer(c, PageLayer::Squint, false)));
    assert!(effects.contains(&Effect::Layer(c, PageLayer::Greyscale, false)));
    assert!(m.live[&c].layers.is_empty());
    m.activate(c, 40).unwrap();
    assert!(m.live[&c].layers.is_empty(), "back on the tab: off until toggled again");

    m.toggle_layer(PageLayer::Squint).unwrap();
    assert!(m.activate(c, 50).unwrap().iter().all(|e| !matches!(e, Effect::Layer(..))), "re-selecting the same tab keeps them");
    let work = m.create_space("Work".into(), "hammer".into());
    assert!(m.switch_space(work, 60).unwrap().contains(&Effect::Layer(c, PageLayer::Squint, false)), "an empty space shows no tab");
    let _ = a;
  }

  #[test]
  fn lenses_need_a_shown_tab() {
    let mut m = model();
    let work = m.create_space("Work".into(), "hammer".into());
    m.switch_space(work, 1).unwrap();
    assert_eq!(m.toggle_layer(PageLayer::Squint).unwrap_err().code, ErrorCode::NoTabShown);
  }

  #[test]
  fn background_tabs_freeze_after_a_while_but_not_the_shown_audible_or_dev_ones() {
    let mut m = model();
    let quiet = m.active_tab().unwrap();
    let (music, _) = m.open_tab("https://music.test/".into(), 0);
    let (dev, _) = m.open_tab("http://localhost:5173/".into(), 0);
    let (shown, _) = m.open_tab("https://a.test/".into(), 0);
    m.live.get_mut(&music).unwrap().playing_audio = true;
    assert_eq!(m.suspend_idle(SUSPEND_AFTER_MS - 1), vec![], "not yet");
    assert_eq!(m.suspend_idle(SUSPEND_AFTER_MS), vec![Effect::Suspend(quiet)]);
    assert_eq!(m.suspend_idle(SUSPEND_AFTER_MS * 2), vec![], "only once");
    assert!(!m.live[&dev].suspended && !m.live[&shown].suspended);

    m.activate(quiet, SUSPEND_AFTER_MS * 3).unwrap();
    assert!(!m.live[&quiet].suspended, "selecting it wakes it");
  }

  #[test]
  fn only_tabs_a_page_opens_are_marked_and_the_mark_isnt_saved() {
    let mut m = model();
    let (typed, _) = m.open_tab("https://a.test/".into(), 1);
    let (from_page, _) = m.open_tab_from_page("blob:https://a.test/uuid".into(), 2);
    assert!(!m.live[&typed].opened_by_page);
    assert!(m.live[&from_page].opened_by_page);
    m.unload_tab(from_page, 3).unwrap();
    m.activate(from_page, 4).unwrap();
    assert!(!m.live[&from_page].opened_by_page, "reloaded later: the strict rule");
    let restored = Model::new(m.session.clone());
    assert!(restored.live.is_empty(), "nothing loaded, nothing marked after a restart");
  }

  #[test]
  fn location_serde_matches_the_contract() {
    let json = r#"{"kind":"pinned","spaceId":1,"folderId":null,"index":2}"#;
    let to: TabLocation = serde_json::from_str(json).unwrap();
    assert_eq!(to, TabLocation::Pinned { space_id: 1, folder_id: None, index: Some(2) });
  }
}
