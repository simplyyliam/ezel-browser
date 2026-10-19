//! What the UI receives: the model resolved into the sidebar's shape (tabs inlined, runtime state merged).

use serde::Serialize;

use super::model::{Id, Model, Pinned};

/// Payload of "tabs-changed" and `get_tabs`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabsState {
  pub active_space_id: Id,
  pub active_tab_id: Option<Id>,
  /// Always `SWATCH_SLOTS` (8) long; `null` = empty cell.
  pub swatches: Vec<Option<TabView>>,
  pub spaces: Vec<SpaceView>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceView {
  pub id: Id,
  pub name: String,
  pub icon: String,
  pub items: Vec<ItemView>,
  pub temp_tabs: Vec<TabView>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ItemView {
  Tab { tab: TabView },
  Folder { folder: FolderView },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderView {
  pub id: Id,
  pub name: String,
  pub collapsed: bool,
  pub tabs: Vec<TabView>,
}

/// Payload of "tab-updated" (one tab's page changed) and every tab in [`TabsState`].
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabView {
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
}

impl TabsState {
  pub fn of(model: &Model) -> Self {
    let tabs = |ids: &[Id]| ids.iter().filter_map(|id| TabView::of(model, *id)).collect();
    let s = &model.session;
    TabsState {
      active_space_id: s.active_space,
      active_tab_id: model.active_tab(),
      swatches: s.swatches.iter().map(|slot| slot.and_then(|id| TabView::of(model, id))).collect(),
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
              Pinned::Tab { id } => TabView::of(model, *id).map(|tab| ItemView::Tab { tab }),
              Pinned::Folder(f) => Some(ItemView::Folder {
                folder: FolderView { id: f.id, name: f.name.clone(), collapsed: f.collapsed, tabs: tabs(&f.tabs) },
              }),
            })
            .collect(),
          temp_tabs: tabs(&space.temp),
        })
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
    })
  }
}
