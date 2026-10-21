//! The UI's commands. Anything that may load a tab is `async`, so it runs off the main thread
//! (creating a webview from a sync command deadlocks on Windows).
//!
//! Ids cross as [`TsId`] and indices as `u32`: specta refuses u64/usize (bigint) in the bindings.

use tauri::{AppHandle, Url};

use super::{
  browser, edit, layers::PageLayer, page_of, shown_webview, update, url_policy,
  model::{TabLocation, TsId},
  view::TabsState,
  PageChanged, SEARCH_URL,
};
use crate::error::{AppError, ErrorCode};

type Result<T> = std::result::Result<T, AppError>;

/// Turns address-bar input into a URL: a web address as-is (https:// added if missing), anything
/// else a search. Local and code schemes (`file:`, `javascript:`, `data:`, other `about:` pages)
/// are refused (`invalid_input`), never loaded (see `url_policy`).
fn resolve_input(input: &str) -> Result<Url> {
  let input = input.trim();
  if url_policy::is_blocked_scheme(input) {
    return Err(AppError::invalid_input("only web addresses (http, https) can be opened"));
  }
  if url_policy::is_allowed(input) {
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

/// Runs a WebView2 call on the shown tab (on the main thread, with a live controller).
#[cfg(windows)]
fn with_shown_webview2(app: &AppHandle, f: fn(&tauri::webview::PlatformWebview)) -> Result<()> {
  Ok(shown(app)?.with_webview(move |pw| f(&pw))?)
}

/// Reloads the shown tab bypassing the cache (Ctrl+Shift+R).
#[tauri::command]
#[specta::specta]
pub fn hard_reload(app: AppHandle) -> Result<()> {
  #[cfg(windows)]
  return with_shown_webview2(&app, crate::webview2::hard_reload);
  // TODO: bypass the cache on macOS and Linux.
  #[cfg(not(windows))]
  Ok(shown(&app)?.reload()?)
}

/// Stops the shown tab loading (Esc).
#[tauri::command]
#[specta::specta]
pub fn stop_loading(app: AppHandle) -> Result<()> {
  #[cfg(windows)]
  return with_shown_webview2(&app, crate::webview2::stop);
  #[cfg(not(windows))]
  Ok(shown(&app)?.eval("window.stop()")?)
}

/// Opens the shown tab's DevTools in their own window (F12, Ctrl+Shift+I).
#[tauri::command]
#[specta::specta]
pub fn open_devtools(app: AppHandle) -> Result<()> {
  #[cfg(windows)]
  return with_shown_webview2(&app, crate::webview2::open_devtools);
  #[cfg(not(windows))]
  {
    shown(&app)?;
    Err(AppError::new(ErrorCode::Unsupported, "DevTools open only on Windows for now"))
  }
}

/// Copies the shown tab's URL to the clipboard (Ctrl+Shift+C) and returns it. Done here because the
/// shortcut leaves focus in the website, where the UI's clipboard API can't write.
#[tauri::command]
#[specta::specta]
pub fn copy_page_url(app: AppHandle) -> Result<String> {
  let browser = browser(&app);
  let id = (*browser.shown.lock().unwrap()).ok_or_else(|| AppError::new(ErrorCode::NoTabShown, "no tab is shown"))?;
  let url = browser.model.lock().unwrap().tab(id)?.url.clone();
  #[cfg(windows)]
  {
    crate::clipboard::set_text(&url).map_err(|e| AppError::internal(format!("clipboard: {e}")))?;
    Ok(url)
  }
  #[cfg(not(windows))]
  Err(AppError::new(ErrorCode::Unsupported, "copying from Rust works only on Windows for now"))
}

/// The load meter: Ezel's memory in all and per loaded tab (approximate; see `browser::memory`).
#[tauri::command]
#[specta::specta]
pub async fn get_memory(app: AppHandle) -> Result<super::memory::MemoryReport> {
  #[cfg(windows)]
  return super::memory_report(&app).await;
  #[cfg(not(windows))]
  {
    let _ = app;
    Err(AppError::new(ErrorCode::Unsupported, "the load meter reads WebView2's processes: Windows only for now"))
  }
}

/// Turns a page layer (lens) on or off in the shown tab; it stays on across navigations in that tab
/// and goes off when another tab is shown. Returns whether it's now on.
#[tauri::command]
#[specta::specta]
pub async fn toggle_page_layer(app: AppHandle, layer: PageLayer) -> Result<bool> {
  update(&app, |m, _| m.toggle_layer(layer))
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

/// Ctrl+Shift+T: reopens the most recently closed tab where it was and selects it. Its new id, or
/// `null` when there's nothing to reopen.
#[tauri::command]
#[specta::specta]
pub async fn reopen_closed_tab(app: AppHandle) -> Result<Option<TsId>> {
  update(&app, |m, now| {
    Ok(match m.reopen_closed_tab(now)? {
      Some((id, effects)) => (Some(TsId(id)), effects),
      None => (None, vec![]),
    })
  })
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

/// Ctrl+Tab / Ctrl+Shift+Tab (`backward`): the active space's next tab in most-recently-used order.
#[tauri::command]
#[specta::specta]
pub async fn cycle_tab(app: AppHandle, backward: bool) -> Result<()> {
  update(&app, |m, now| Ok(((), m.cycle_tab(backward, now)?)))
}

/// Mutes or unmutes a tab (its speaker icon, or Mute Tab / Unmute Tab in its menu).
#[tauri::command]
#[specta::specta]
pub async fn set_tab_muted(app: AppHandle, id: TsId, muted: bool) -> Result<()> {
  update(&app, |m, _| Ok(((), m.set_muted(id.0, muted)?)))
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
    assert_eq!(resolve_input("about:blank").unwrap().as_str(), "about:blank");
  }

  #[test]
  fn typed_local_and_code_addresses_are_refused() {
    for input in ["file:///C:/Windows/win.ini", "javascript:alert(1)", "data:text/html,<b>x</b>", "about:settings", "  FILE://x"] {
      assert_eq!(resolve_input(input).unwrap_err().code, crate::error::ErrorCode::InvalidInput, "{input}");
    }
    // Whatever it resolves to is something a tab may load.
    for input in ["example.com", "localhost:3000/a", "mailto:a@b.c", "a b c", "http://x.test"] {
      assert!(super::url_policy::is_allowed(resolve_input(input).unwrap().as_str()), "{input}");
    }
  }
}
