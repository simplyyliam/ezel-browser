//! The UI's commands. Anything that may load a tab is `async`, so it runs off the main thread
//! (creating a webview from a sync command deadlocks on Windows).
//!
//! Ids cross as [`TsId`] and indices as `u32`: specta refuses u64/usize (bigint) in the bindings.

use tauri::{AppHandle, Url};

use super::{
  browser, edit, page_of, shown_webview, update,
  model::{TabLocation, TsId},
  view::TabsState,
  PageChanged, SEARCH_URL,
};
use crate::error::{AppError, ErrorCode};

type Result<T> = std::result::Result<T, AppError>;

/// Turns address-bar input into a URL: a URL as-is (https:// added if missing), anything else a search.
fn resolve_input(input: &str) -> Result<Url> {
  let input = input.trim();
  let has_scheme = ["http://", "https://", "about:", "file://"]
    .iter()
    .any(|s| input.to_ascii_lowercase().starts_with(s));
  if has_scheme {
    return Url::parse(input).map_err(|e| AppError::invalid_input(e.to_string()));
  }

  let host = input.split(['/', '?', '#']).next().unwrap_or("");
  let looks_like_host = !input.contains(char::is_whitespace)
    && (host.contains('.') || host == "localhost" || host.starts_with("localhost:"));
  if looks_like_host {
    if let Ok(url) = Url::parse(&format!("https://{input}")) {
      return Ok(url);
    }
  }

  Url::parse_with_params(SEARCH_URL, &[("q", input)]).map_err(|e| AppError::invalid_input(e.to_string()))
}

fn shown(app: &AppHandle) -> Result<tauri::Webview> {
  shown_webview(app).ok_or_else(|| AppError::new(ErrorCode::NoTabShown, "no tab is shown"))
}

// ---- The shown tab ----

/// Loads input in the shown tab, or in a new tab when none is shown.
#[tauri::command]
#[specta::specta]
pub async fn navigate(app: AppHandle, input: String) -> Result<()> {
  let url = resolve_input(&input)?;
  match shown_webview(&app) {
    Some(webview) => Ok(webview.navigate(url)?),
    None => update(&app, |m, now| Ok(((), m.open_tab(url.to_string(), now).1))),
  }
}

/// The shown tab's page, so the UI can catch up on events emitted before it started listening.
#[tauri::command]
#[specta::specta]
pub fn get_page(app: AppHandle) -> Result<PageChanged> {
  let browser = browser(&app);
  let shown = *browser.shown.lock().unwrap();
  Ok(shown.map(|id| page_of(&browser.model.lock().unwrap(), id)).unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub fn go_back(app: AppHandle) -> Result<()> {
  Ok(shown(&app)?.eval("history.back()")?)
}

#[tauri::command]
#[specta::specta]
pub fn go_forward(app: AppHandle) -> Result<()> {
  Ok(shown(&app)?.eval("history.forward()")?)
}

#[tauri::command]
#[specta::specta]
pub fn reload(app: AppHandle) -> Result<()> {
  Ok(shown(&app)?.reload()?)
}

// ---- Tabs ----

/// Everything the sidebar shows. Also emitted as "tabs-changed" after every change.
#[tauri::command]
#[specta::specta]
pub fn get_tabs(app: AppHandle) -> Result<TabsState> {
  Ok(TabsState::of(&browser(&app).model.lock().unwrap()))
}

/// Opens a new temp tab in the active space (address-bar input, or the home page) and selects it.
#[tauri::command]
#[specta::specta]
pub async fn open_tab(app: AppHandle, input: Option<String>) -> Result<TsId> {
  let url = match input {
    Some(input) => resolve_input(&input)?.to_string(),
    None => super::HOME_URL.to_string(),
  };
  update(&app, |m, now| Ok(m.open_tab(url, now))).map(TsId)
}

#[tauri::command]
#[specta::specta]
pub async fn activate_tab(app: AppHandle, id: TsId) -> Result<()> {
  update(&app, |m, now| Ok(((), m.activate(id.0, now)?)))
}

/// A temp tab is removed; a pinned or swatch tab is unloaded and reset to its pinned URL.
#[tauri::command]
#[specta::specta]
pub async fn close_tab(app: AppHandle, id: TsId) -> Result<()> {
  update(&app, |m, now| Ok(((), m.close_tab(id.0, now)?)))
}

/// Removes any tab, pinned or not.
#[tauri::command]
#[specta::specta]
pub async fn remove_tab(app: AppHandle, id: TsId) -> Result<()> {
  update(&app, |m, now| Ok(((), m.remove_tab(id.0, now)?)))
}

/// Frees the tab's memory; it keeps its place and page, and reloads when selected.
#[tauri::command]
#[specta::specta]
pub async fn unload_tab(app: AppHandle, id: TsId) -> Result<()> {
  update(&app, |m, now| Ok(((), m.unload_tab(id.0, now)?)))
}

/// Pin, unpin, add to swatches or a folder, reorder, or move to another space.
#[tauri::command]
#[specta::specta]
pub async fn move_tab(app: AppHandle, id: TsId, to: TabLocation) -> Result<()> {
  edit(&app, |m| m.move_tab(id.0, to))
}

/// Navigates a pinned or swatch tab back to its pinned URL.
#[tauri::command]
#[specta::specta]
pub async fn reset_tab(app: AppHandle, id: TsId) -> Result<()> {
  update(&app, |m, _| Ok(((), m.reset_tab(id.0)?)))
}

/// Makes a pinned or swatch tab's current URL its pinned URL.
#[tauri::command]
#[specta::specta]
pub async fn update_pinned_url(app: AppHandle, id: TsId) -> Result<()> {
  edit(&app, |m| m.update_pinned_url(id.0))
}

/// Trash-all: removes the space's temp tabs; pinned tabs and swatches stay.
#[tauri::command]
#[specta::specta]
pub async fn clear_temp_tabs(app: AppHandle, space_id: TsId) -> Result<()> {
  update(&app, |m, now| Ok(((), m.clear_temp_tabs(space_id.0, now)?)))
}

// ---- Folders ----

#[tauri::command]
#[specta::specta]
pub async fn create_folder(app: AppHandle, space_id: TsId, name: String, index: Option<u32>) -> Result<TsId> {
  edit(&app, |m| m.create_folder(space_id.0, name, index.map(|i| i as usize))).map(TsId)
}

#[tauri::command]
#[specta::specta]
pub async fn rename_folder(app: AppHandle, id: TsId, name: String) -> Result<()> {
  edit(&app, |m| m.rename_folder(id.0, name))
}

#[tauri::command]
#[specta::specta]
pub async fn set_folder_collapsed(app: AppHandle, id: TsId, collapsed: bool) -> Result<()> {
  edit(&app, |m| m.set_folder_collapsed(id.0, collapsed))
}

#[tauri::command]
#[specta::specta]
pub async fn move_folder(app: AppHandle, id: TsId, space_id: TsId, index: Option<u32>) -> Result<()> {
  edit(&app, |m| m.move_folder(id.0, space_id.0, index.map(|i| i as usize)))
}

/// `keep_tabs`: unpack (its tabs stay pinned where it was); otherwise its tabs are removed too.
#[tauri::command]
#[specta::specta]
pub async fn delete_folder(app: AppHandle, id: TsId, keep_tabs: bool) -> Result<()> {
  update(&app, |m, now| Ok(((), m.delete_folder(id.0, keep_tabs, now)?)))
}

#[tauri::command]
#[specta::specta]
pub async fn unload_folder(app: AppHandle, id: TsId) -> Result<()> {
  update(&app, |m, now| Ok(((), m.unload_folder(id.0, now)?)))
}

// ---- Spaces ----

/// `icon`: a lucide icon name.
#[tauri::command]
#[specta::specta]
pub async fn create_space(app: AppHandle, name: String, icon: String) -> Result<TsId> {
  edit(&app, |m| Ok(m.create_space(name, icon))).map(TsId)
}

#[tauri::command]
#[specta::specta]
pub async fn update_space(app: AppHandle, id: TsId, name: Option<String>, icon: Option<String>) -> Result<()> {
  edit(&app, |m| m.update_space(id.0, name, icon))
}

#[tauri::command]
#[specta::specta]
pub async fn move_space(app: AppHandle, id: TsId, index: u32) -> Result<()> {
  edit(&app, |m| m.move_space(id.0, index as usize))
}

/// Deletes a space and its tabs. The last space can't be deleted.
#[tauri::command]
#[specta::specta]
pub async fn delete_space(app: AppHandle, id: TsId) -> Result<()> {
  update(&app, |m, now| Ok(((), m.delete_space(id.0, now)?)))
}

/// Selects a space; it shows the tab it showed last.
#[tauri::command]
#[specta::specta]
pub async fn switch_space(app: AppHandle, id: TsId) -> Result<()> {
  update(&app, |m, now| Ok(((), m.switch_space(id.0, now)?)))
}

#[cfg(test)]
mod tests {
  use super::resolve_input;

  #[test]
  fn input_resolves_to_url_or_search() {
    assert_eq!(resolve_input("example.com/a").unwrap().as_str(), "https://example.com/a");
    assert_eq!(resolve_input("localhost:5173").unwrap().as_str(), "https://localhost:5173/");
    assert!(resolve_input("rust borrow checker").unwrap().as_str().contains("q=rust+borrow+checker"));
  }
}
