//! The UI's commands. Anything that may load a tab is `async`, so it runs off the main thread
//! (creating a webview from a sync command deadlocks on Windows).
//!
//! Ids cross as [`TsId`] and indices as `u32`: specta refuses u64/usize (bigint) in the bindings.

use tauri::{AppHandle, Url};

use super::{
  browser, edit, layers::PageLayer, page_menu::{self, PageMenuAction}, page_of, shown_webview, tab_webview, update, url_policy,
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

/// The page menu's choice (`null`: it closed without one) for menu `id` (an older menu's answer is
/// ignored: a new right-click already finished it). WebView2's own commands run on what was
/// right-clicked; Ezel's act on the link, image or selection Rust kept from the request. Anything
/// that wasn't offered is refused (`invalid_input`).
#[tauri::command]
#[specta::specta]
pub async fn choose_page_menu_item(app: AppHandle, id: u32, action: Option<PageMenuAction>) -> Result<()> {
  let open = {
    let browser = browser(&app);
    let mut menu = browser.menu.lock().unwrap();
    if menu.as_ref().map(|m| m.id) != Some(id) {
      return Ok(());
    }
    menu.take()
  };
  let Some(open) = open else { return Ok(()) };
  let finish = |native: Option<&'static str>| {
    #[cfg(windows)]
    let _ = app.run_on_main_thread(move || crate::webview2::finish_menu(native));
    #[cfg(not(windows))]
    let _ = native;
  };
  let Some(action) = action else {
    finish(None);
    return Ok(());
  };
  if !page_menu::offered(&open.groups, action) {
    finish(None);
    return Err(AppError::invalid_input("that wasn't in the menu"));
  }
  let webview = tab_webview(&app, open.tab);
  if let Some(name) = action.native_name() {
    // Its own commands act where the page's focus is: give it back first.
    if let Some(webview) = &webview {
      let _ = webview.set_focus();
    }
    finish(Some(name));
    return Ok(());
  }
  finish(None);
  let target = open.target;
  match action {
    PageMenuAction::Back | PageMenuAction::Forward | PageMenuAction::Reload => {
      let Some(webview) = webview else { return Ok(()) };
      let _ = webview.set_focus();
      match action {
        PageMenuAction::Back => webview.eval("history.back()")?,
        PageMenuAction::Forward => webview.eval("history.forward()")?,
        _ => webview.reload()?,
      }
    }
    PageMenuAction::OpenLinkInNewTab | PageMenuAction::OpenImageInNewTab => {
      let url = if action == PageMenuAction::OpenLinkInNewTab { target.link } else { target.image };
      let url = url.filter(|u| url_policy::is_allowed(u)).ok_or_else(|| AppError::invalid_input("only web addresses open in a tab"))?;
      update(&app, |m, now| Ok(((), { m.open_background_tab(url, now); vec![] })))?;
    }
    PageMenuAction::CopyLink => {
      let link = target.link.ok_or_else(|| AppError::invalid_input("no link"))?;
      #[cfg(windows)]
      crate::clipboard::set_text(&link).map_err(|e| AppError::internal(format!("clipboard: {e}")))?;
      #[cfg(not(windows))]
      let _ = link;
    }
    PageMenuAction::SearchSelection => {
      let text: String = target.selection.unwrap_or_default().split_whitespace().collect::<Vec<_>>().join(" ");
      let text: String = text.chars().take(page_menu::MAX_SEARCH).collect();
      if text.is_empty() {
        return Err(AppError::invalid_input("nothing selected"));
      }
      let url = Url::parse_with_params(SEARCH_URL, &[("q", text.as_str())]).map_err(|e| AppError::invalid_input(e.to_string()))?;
      update(&app, |m, now| Ok(((), m.open_tab(url.to_string(), now).1)))?;
    }
    // Every other action has a native name (handled above).
    _ => {}
  }
  Ok(())
}

// ---- Site permissions ----

/// Ezel's permission prompt was answered: `allow` true/false is remembered for the site, `null`
/// (dismissed) declines once.
#[tauri::command]
#[specta::specta]
pub fn answer_permission(app: AppHandle, id: u32, allow: Option<bool>) -> Result<()> {
  super::answer_permission(&app, id, allow)
}

/// Every site's remembered permissions (the site panel and the permissions list).
#[tauri::command]
#[specta::specta]
pub fn get_site_permissions(app: AppHandle) -> Result<Vec<super::permissions::SitePermissions>> {
  Ok(super::site_permissions(&app))
}

/// Forgets a site's answer for one permission: it asks again next time.
#[tauri::command]
#[specta::specta]
pub fn revoke_site_permission(app: AppHandle, origin: String, permission: super::permissions::SitePermission) -> Result<()> {
  if origin.len() > 2048 {
    return Err(AppError::invalid_input("that's not a site"));
  }
  super::revoke_site_permission(&app, &origin, permission)
}

// ---- Downloads ----

/// This session's downloads, newest first (also "downloads-changed").
#[tauri::command]
#[specta::specta]
pub fn get_downloads(app: AppHandle) -> Result<super::downloads::DownloadsState> {
  Ok(browser(&app).downloads.lock().unwrap().view())
}

/// Opens a finished download with its default app (Windows asks first for files from the web).
#[tauri::command]
#[specta::specta]
pub fn open_download(app: AppHandle, id: u32) -> Result<()> {
  let path = browser(&app).downloads.lock().unwrap().completed_path(id).map(|p| p.to_path_buf());
  let path = path.filter(|p| p.is_file()).ok_or_else(|| AppError::not_found("that download isn't on disk"))?;
  #[cfg(windows)]
  {
    std::process::Command::new("explorer.exe").arg(&path).spawn().map_err(|e| AppError::internal(format!("open: {}", e.kind())))?;
    Ok(())
  }
  #[cfg(not(windows))]
  {
    let _ = path;
    Err(AppError::new(ErrorCode::Unsupported, "opening downloads works only on Windows for now"))
  }
}

/// Shows a download's file selected in File Explorer (or its folder, if the file is gone).
#[tauri::command]
#[specta::specta]
pub fn show_download_in_folder(app: AppHandle, id: u32) -> Result<()> {
  let path = browser(&app).downloads.lock().unwrap().path(id).map(|p| p.to_path_buf()).ok_or_else(|| AppError::not_found("no such download"))?;
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    let mut explorer = std::process::Command::new("explorer.exe");
    if path.is_file() {
      // `/select,"<path>"` exactly as Explorer expects it (Windows paths can't contain quotes).
      explorer.raw_arg(format!("/select,\"{}\"", path.display()));
    } else if let Some(folder) = path.parent().filter(|f| f.is_dir()) {
      explorer.arg(folder);
    } else {
      return Err(AppError::not_found("that download's folder is gone"));
    }
    explorer.spawn().map_err(|e| AppError::internal(format!("show in folder: {}", e.kind())))?;
    Ok(())
  }
  #[cfg(not(windows))]
  {
    let _ = path;
    Err(AppError::new(ErrorCode::Unsupported, "showing downloads works only on Windows for now"))
  }
}

/// Cancels a running download; it stays in the list as cancelled.
#[tauri::command]
#[specta::specta]
pub fn cancel_download(app: AppHandle, id: u32) -> Result<()> {
  let state = browser(&app).downloads.lock().unwrap().state(id).ok_or_else(|| AppError::not_found("no such download"))?;
  if state != super::downloads::DownloadState::InProgress {
    return Ok(());
  }
  #[cfg(windows)]
  app.run_on_main_thread(move || crate::webview2::cancel_download(id))?;
  Ok(())
}

/// "Clear": forgets the finished downloads (their files stay where they are).
#[tauri::command]
#[specta::specta]
pub fn clear_downloads(app: AppHandle) -> Result<()> {
  let browser = browser(&app);
  let mut list = browser.downloads.lock().unwrap();
  list.clear_finished();
  crate::emit_to_ui(&app, &list.view());
  Ok(())
}

/// Longest find term (more is a paste, not a search).
const MAX_FIND: usize = 1000;

fn check_find_query(query: &str) -> Result<()> {
  if query.chars().count() > MAX_FIND || query.contains(['\n', '\r']) {
    return Err(AppError::invalid_input("find takes one line of at most 1000 characters"));
  }
  Ok(())
}

/// Find in page (Ctrl+F): highlights every match of `query` in the shown tab and makes the first
/// one active; results come as "find-changed". An empty query ends the session.
#[tauri::command]
#[specta::specta]
pub async fn find_start(app: AppHandle, query: String) -> Result<()> {
  check_find_query(&query)?;
  let webview = shown(&app)?;
  #[cfg(windows)]
  {
    // Async (off the main thread), so waiting for the main thread's answer is fine.
    let (tx, rx) = std::sync::mpsc::channel();
    webview.with_webview(move |pw| {
      let started = if query.is_empty() {
        crate::webview2::find_stop(&pw);
        true
      } else {
        crate::webview2::find_start(&pw, &query)
      };
      let _ = tx.send(started);
    })?;
    match tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(std::time::Duration::from_secs(2))).await {
      Ok(Ok(false)) => Err(AppError::new(ErrorCode::Unsupported, "this WebView2 runtime can't find in pages")),
      _ => Ok(()),
    }
  }
  #[cfg(not(windows))]
  {
    let _ = (webview, query);
    Err(AppError::new(ErrorCode::Unsupported, "find in page works only on Windows for now"))
  }
}

/// The next match (Enter), or the previous one (`backward`, Shift+Enter).
#[tauri::command]
#[specta::specta]
pub fn find_next(app: AppHandle, backward: bool) -> Result<()> {
  let webview = shown(&app)?;
  #[cfg(windows)]
  webview.with_webview(move |pw| crate::webview2::find_next(&pw, backward))?;
  #[cfg(not(windows))]
  let _ = (webview, backward);
  Ok(())
}

/// Closes find in page: highlights go. `refocus`: the page gets keyboard focus back (Esc).
#[tauri::command]
#[specta::specta]
pub fn find_stop(app: AppHandle, refocus: bool) -> Result<()> {
  let Some(webview) = shown_webview(&app) else { return Ok(()) };
  #[cfg(windows)]
  webview.with_webview(|pw| crate::webview2::find_stop(&pw))?;
  if refocus {
    webview.set_focus()?;
  }
  Ok(())
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

/// Reloads any loaded tab (its menu's Reload Tab), shown or not. An unloaded tab has no page to
/// reload: nothing happens (`not_found` if the tab doesn't exist).
#[tauri::command]
#[specta::specta]
pub fn reload_tab(app: AppHandle, id: TsId) -> Result<()> {
  browser(&app).model.lock().unwrap().tab(id.0)?;
  match super::tab_webview(&app, id.0) {
    Some(webview) => Ok(webview.reload()?),
    None => Ok(()),
  }
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

/// "Clear This Site's Data" (the site info panel): everything the shown page's site stored in
/// Ezel (cookies, storage, caches), then the page reloads. Returns the site's host.
#[tauri::command]
#[specta::specta]
pub fn clear_site_data(app: AppHandle) -> Result<String> {
  let browser = browser(&app);
  let id = (*browser.shown.lock().unwrap()).ok_or_else(|| AppError::new(ErrorCode::NoTabShown, "no tab is shown"))?;
  let url = browser.model.lock().unwrap().tab(id)?.url.clone();
  let (Some(origin), Some(host)) = (super::site::origin_of(&url), super::site::host_of(&url)) else {
    return Err(AppError::invalid_input("this page isn't a website"));
  };
  #[cfg(windows)]
  {
    shown(&app)?.with_webview(move |pw| crate::webview2::clear_site_data(&pw, &origin))?;
    Ok(host)
  }
  #[cfg(not(windows))]
  {
    let _ = (origin, host);
    Err(AppError::new(ErrorCode::Unsupported, "clearing a site's data works only on Windows for now"))
  }
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

/// Reopens the `n`-th most recently closed tab (0 = the newest), where it was, and selects it.
#[tauri::command]
#[specta::specta]
pub async fn reopen_recent_tab(app: AppHandle, n: u32) -> Result<TsId> {
  update(&app, |m, now| m.reopen_recent(n as usize, now)).map(TsId)
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

/// "New Folder with Tab": a folder holding the tab, where the tab was (see the model).
#[tauri::command]
#[specta::specta]
pub async fn create_folder_with_tab(app: AppHandle, tab_id: TsId, name: String) -> Result<TsId> {
  edit(&app, |m| m.create_folder_with_tab(tab_id.0, name)).map(TsId)
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

/// Deletes a space: its tabs and folders move to `move_to`'s lists, or close with it. The last
/// space can't be deleted.
#[tauri::command]
#[specta::specta]
pub async fn delete_space(app: AppHandle, id: TsId, move_to: Option<TsId>) -> Result<()> {
  update(&app, |m, now| Ok(((), m.delete_space(id.0, move_to.map(|t| t.0), now)?)))
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
  fn find_queries_are_one_short_line() {
    assert!(super::check_find_query("").is_ok(), "empty ends the session");
    assert!(super::check_find_query("figma ✓").is_ok());
    assert!(super::check_find_query(&"x".repeat(super::MAX_FIND)).is_ok());
    assert!(super::check_find_query(&"x".repeat(super::MAX_FIND + 1)).is_err());
    assert!(super::check_find_query("a\nb").is_err());
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
