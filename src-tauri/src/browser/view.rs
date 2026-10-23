//! What the UI receives: the model resolved into the sidebar's shape (tabs inlined, runtime state merged).
//!
//! The TypeScript names are the frontend's: `Tab`, `Folder`, `Space` come from `#[serde(rename)]`
//! (which doesn't change the JSON). Ids are exported as `Id` (`number`) through `#[specta(type = TsId)]`.

use serde::Serialize;
use specta::Type;
use tauri_specta::Event;

use super::layers::PageLayer;
use super::model::{is_dev_url, Id, Model, Pinned, TsId};

/// Payload of "tabs-changed" and `get_tabs`.
#[derive(Clone, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "tabs-changed")]
pub struct TabsState {
  #[specta(type = TsId)]
  pub active_space_id: Id,
  #[specta(type = Option<TsId>)]
  pub active_tab_id: Option<Id>,
  /// Always `SWATCH_SLOTS` (12) long.
  pub swatches: Vec<Swatch>,
  pub spaces: Vec<SpaceView>,
  /// How many closed tabs "Reopen Closed Tab" can bring back (0 hides it).
  pub closed_count: u32,
  /// The last few closed tabs, newest first (the palette's chips); `reopen_recent_tab(n)` takes
  /// the n-th.
  pub recently_closed: Vec<ClosedTabView>,
}

/// Most closed tabs the palette offers.
pub const RECENTLY_CLOSED_SHOWN: usize = 5;

#[derive(Clone, Serialize, Type)]
#[serde(rename = "ClosedTab", rename_all = "camelCase")]
pub struct ClosedTabView {
  pub url: String,
  pub title: Option<String>,
  pub favicon: Option<String>,
}

/// One cell of the Swatches grid; `null` = empty cell.
#[derive(Clone, Serialize, Type)]
#[serde(transparent)]
pub struct Swatch(pub Option<TabView>);

#[derive(Clone, Serialize, Type)]
#[serde(rename = "Space", rename_all = "camelCase")]
pub struct SpaceView {
  #[specta(type = TsId)]
  pub id: Id,
  pub name: String,
  pub icon: String,
  pub items: Vec<SpaceItem>,
  pub temp_tabs: Vec<TabView>,
}

/// A space's pinned list mixes folders and standalone tabs.
#[derive(Clone, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SpaceItem {
  Tab { tab: TabView },
  Folder { folder: FolderView },
}

#[derive(Clone, Serialize, Type)]
#[serde(rename = "Folder", rename_all = "camelCase")]
pub struct FolderView {
  #[specta(type = TsId)]
  pub id: Id,
  pub name: String,
  pub collapsed: bool,
  pub tabs: Vec<TabView>,
}

/// Payload of "tab-updated" (one tab's page changed) and every tab in [`TabsState`].
#[derive(Clone, Serialize, Type, Event)]
#[serde(rename = "Tab", rename_all = "camelCase")]
#[tauri_specta(event_name = "tab-updated")]
pub struct TabView {
  #[specta(type = TsId)]
  pub id: Id,
  pub url: String,
  pub title: Option<String>,
  pub favicon: Option<String>,
  /// Pinned and swatch tabs: the URL a reset returns to.
  pub pinned_url: Option<String>,
  /// Has a webview. Unloaded tabs show dimmed and load when selected.
  pub is_loaded: bool,
  pub is_loading: bool,
  pub is_playing_audio: bool,
  /// Muted by the user (shown with a crossed speaker whether or not it's playing).
  pub is_muted: bool,
  /// Served from this machine (localhost, 127.0.0.1, [::1], *.localhost): never auto-unloaded.
  pub is_dev: bool,
  /// Page layers (lenses) on in this tab; only the shown tab has any.
  pub layers: Vec<PageLayer>,
}

impl TabsState {
  pub fn of(model: &Model) -> Self {
    let tabs = |ids: &[Id]| ids.iter().filter_map(|id| TabView::of(model, *id)).collect();
    let s = &model.session;
    TabsState {
      active_space_id: s.active_space,
      active_tab_id: model.active_tab(),
      swatches: s.swatches.iter().map(|slot| Swatch(slot.and_then(|id| TabView::of(model, id)))).collect(),
      spaces: s
        .spaces
        .iter()
        .map(|space| SpaceView {
          id: space.id,
          name: space.name.clone(),
          icon: space.icon.clone(),
          items: space
            .pinned
            .iter()
            .filter_map(|item| match item {
              Pinned::Tab { id } => TabView::of(model, *id).map(|tab| SpaceItem::Tab { tab }),
              Pinned::Folder(f) => Some(SpaceItem::Folder {
                folder: FolderView { id: f.id, name: f.name.clone(), collapsed: f.collapsed, tabs: tabs(&f.tabs) },
              }),
            })
            .collect(),
          temp_tabs: tabs(&space.temp),
        })
        .collect(),
      closed_count: s.closed.len() as u32,
      recently_closed: s
        .closed
        .iter()
        .rev()
        .take(RECENTLY_CLOSED_SHOWN)
        .map(|c| ClosedTabView { url: c.url.clone(), title: c.title.clone(), favicon: c.favicon.clone() })
        .collect(),
    }
  }
}

impl TabView {
  pub fn of(model: &Model, id: Id) -> Option<Self> {
    let tab = model.session.tabs.get(&id)?;
    let live = model.live.get(&id);
    Some(TabView {
      id,
      url: tab.url.clone(),
      title: tab.title.clone(),
      favicon: tab.favicon.clone(),
      pinned_url: tab.pinned_url.clone(),
      is_loaded: live.is_some(),
      is_loading: live.is_some_and(|l| l.is_loading),
      is_playing_audio: live.is_some_and(|l| l.playing_audio),
      is_muted: tab.muted,
      is_dev: is_dev_url(&tab.url),
      layers: live.map(|l| l.layers.clone()).unwrap_or_default(),
    })
  }
}
