//! The UI's commands. Anything that may load a tab is `async`, so it runs off the main thread
//! (creating a webview from a sync command deadlocks on Windows).

use tauri::{AppHandle, Url};

use super::{
  browser, edit, page_of, shown_webview, update,
  model::{Id, Location},
  view::TabsState,
  PageChanged, SEARCH_URL,
};

type Result<T> = std::result::Result<T, String>;

/// Turns address-bar input into a URL: a URL as-is (https:// added if missing), anything else a search.
fn resolve_input(input: &str) -> Result<Url> {
  let input = input.trim();
  let has_scheme = ["http://", "https://", "about:", "file://"]
    .iter()
    .any(|s| input.to_ascii_lowercase().starts_with(s));
  if has_scheme {
    return Url::parse(input).map_err(|e| e.to_string());
  }

  let host = input.split(['/', '?', '#']).next().unwrap_or("");
  let looks_like_host = !input.contains(char::is_whitespace)
    && (host.contains('.') || host == "localhost" || host.starts_with("localhost:"));
  if looks_like_host {
    if let Ok(url) = Url::parse(&format!("https://{input}")) {
      return Ok(url);
    }
  }

  Url::parse_with_params(SEARCH_URL, &[("q", input)]).map_err(|e| e.to_string())
}

fn shown(app: &AppHandle) -> Result<tauri::Webview> {
  shown_webview(app).ok_or_else(|| "no tab is shown".into())
}

// ---- The shown tab ----

/// Loads input in the shown tab, or in a new tab when none is shown.
#[tauri::command]
pub async fn navigate(app: AppHandle, input: String) -> Result<()> {
  let url = resolve_input(&input)?;
  match shown_webview(&app) {
    Some(webview) => webview.navigate(url).map_err(|e| e.to_string()),
    None => update(&app, |m, now| Ok(((), m.open_tab(url.to_string(), now).1))),
  }
}

/// The shown tab's page, so the UI can catch up on events emitted before it started listening.
#[tauri::command]
pub fn get_page(app: AppHandle) -> PageChanged {
  let browser = browser(&app);
  let shown = *browser.shown.lock().unwrap();
  shown.map(|id| page_of(&browser.model.lock().unwrap(), id)).unwrap_or_default()
}

#[tauri::command]
pub fn go_back(app: AppHandle) -> Result<()> {
  shown(&app)?.eval("history.back()").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn go_forward(app: AppHandle) -> Result<()> {
  shown(&app)?.eval("history.forward()").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reload(app: AppHandle) -> Result<()> {
  shown(&app)?.reload().map_err(|e| e.to_string())
}

// ---- Tabs ----

/// Everything the sidebar shows. Also emitted as "tabs-changed" after every change.
#[tauri::command]
pub fn get_tabs(app: AppHandle) -> TabsState {
  TabsState::of(&browser(&app).model.lock().unwrap())
}

/// Opens a new temp tab in the active space (address-bar input, or the home page) and selects it.
#[tauri::command]
pub async fn open_tab(app: AppHandle, input: Option<String>) -> Result<Id> {
  let url = match input {
    Some(input) => resolve_input(&input)?.to_string(),
    None => super::HOME_URL.to_string(),
  };
  update(&app, |m, now| Ok(m.open_tab(url, now)))
}

#[tauri::command]
pub async fn activate_tab(app: AppHandle, id: Id) -> Result<()> {
  update(&app, |m, now| Ok(((), m.activate(id, now)?)))
}

/// A temp tab is removed; a pinned or swatch tab is unloaded and reset to its pinned URL.
#[tauri::command]
pub async fn close_tab(app: AppHandle, id: Id) -> Result<()> {
  update(&app, |m, now| Ok(((), m.close_tab(id, now)?)))
}

/// Removes any tab, pinned or not.
#[tauri::command]
pub async fn remove_tab(app: AppHandle, id: Id) -> Result<()> {
  update(&app, |m, now| Ok(((), m.remove_tab(id, now)?)))
}

/// Frees the tab's memory; it keeps its place and page, and reloads when selected.
#[tauri::command]
pub async fn unload_tab(app: AppHandle, id: Id) -> Result<()> {
  update(&app, |m, now| Ok(((), m.unload_tab(id, now)?)))
}

/// Pin, unpin, add to swatches or a folder, reorder, or move to another space.
#[tauri::command]
pub async fn move_tab(app: AppHandle, id: Id, to: Location) -> Result<()> {
  edit(&app, |m| m.move_tab(id, to))
}

/// Navigates a pinned or swatch tab back to its pinned URL.
#[tauri::command]
pub async fn reset_tab(app: AppHandle, id: Id) -> Result<()> {
  update(&app, |m, _| Ok(((), m.reset_tab(id)?)))
}

/// Makes a pinned or swatch tab's current URL its pinned URL.
#[tauri::command]
pub async fn update_pinned_url(app: AppHandle, id: Id) -> Result<()> {
  edit(&app, |m| m.update_pinned_url(id))
}

/// Trash-all: removes the space's temp tabs; pinned tabs and swatches stay.
#[tauri::command]
pub async fn clear_temp_tabs(app: AppHandle, space_id: Id) -> Result<()> {
  update(&app, |m, now| Ok(((), m.clear_temp_tabs(space_id, now)?)))
}

// ---- Folders ----

#[tauri::command]
pub async fn create_folder(app: AppHandle, space_id: Id, name: String, index: Option<usize>) -> Result<Id> {
  edit(&app, |m| m.create_folder(space_id, name, index))
}

#[tauri::command]
pub async fn rename_folder(app: AppHandle, id: Id, name: String) -> Result<()> {
  edit(&app, |m| m.rename_folder(id, name))
}

#[tauri::command]
pub async fn set_folder_collapsed(app: AppHandle, id: Id, collapsed: bool) -> Result<()> {
  edit(&app, |m| m.set_folder_collapsed(id, collapsed))
}

#[tauri::command]
pub async fn move_folder(app: AppHandle, id: Id, space_id: Id, index: Option<usize>) -> Result<()> {
  edit(&app, |m| m.move_folder(id, space_id, index))
}

/// `keep_tabs`: unpack (its tabs stay pinned where it was); otherwise its tabs are removed too.
#[tauri::command]
pub async fn delete_folder(app: AppHandle, id: Id, keep_tabs: bool) -> Result<()> {
  update(&app, |m, now| Ok(((), m.delete_folder(id, keep_tabs, now)?)))
}

#[tauri::command]
pub async fn unload_folder(app: AppHandle, id: Id) -> Result<()> {
  update(&app, |m, now| Ok(((), m.unload_folder(id, now)?)))
}

// ---- Spaces ----

/// `icon`: a lucide icon name.
#[tauri::command]
pub async fn create_space(app: AppHandle, name: String, icon: String) -> Result<Id> {
  edit(&app, |m| Ok(m.create_space(name, icon)))
}

#[tauri::command]
pub async fn update_space(app: AppHandle, id: Id, name: Option<String>, icon: Option<String>) -> Result<()> {
  edit(&app, |m| m.update_space(id, name, icon))
}

#[tauri::command]
pub async fn move_space(app: AppHandle, id: Id, index: usize) -> Result<()> {
  edit(&app, |m| m.move_space(id, index))
}

/// Deletes a space and its tabs. The last space can't be deleted.
#[tauri::command]
pub async fn delete_space(app: AppHandle, id: Id) -> Result<()> {
  update(&app, |m, now| Ok(((), m.delete_space(id, now)?)))
}

/// Selects a space; it shows the tab it showed last.
#[tauri::command]
pub async fn switch_space(app: AppHandle, id: Id) -> Result<()> {
  update(&app, |m, now| Ok(((), m.switch_space(id, now)?)))
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
