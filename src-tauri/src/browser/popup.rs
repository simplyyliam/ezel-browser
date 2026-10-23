//! Sized popups (`window.open` with a size: "Sign in with Google", payment windows) open in a small
//! window of Ezel's own, so its title can say which site it is: the domain first, which the page
//! can't change (`site::popup_title`). It shares the tabs' WebView2 environment (Tauri passes it
//! through the new-window features), so `window.opener` keeps working and sign-ins land in the tab.
//!
//! Same rules as a tab: no IPC (its label is `popup-<n>`, never `ui`, and the only capability is
//! scoped to `ui`), the same navigation policy, the same quiet defaults. Links it opens without a
//! size become tabs; sized ones another popup.

use std::sync::{
  atomic::{AtomicU32, Ordering},
  Arc, Mutex,
};

use tauri::{
  webview::{NewWindowFeatures, NewWindowResponse, PageLoadEvent},
  AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder,
};

use super::{site, update, url_policy};

const POPUP_LABEL_PREFIX: &str = "popup-";

/// A popup's label: never `ui` (for the IPC isolation test).
pub fn label(n: u32) -> String {
  format!("{POPUP_LABEL_PREFIX}{n}")
}

/// Opens `url` (already checked by the caller) in a popup window of Ezel's own. Called from a
/// webview's new-window handler: wry defers the handler, so building a window here is safe.
pub fn open(app: &AppHandle, url: &Url, features: NewWindowFeatures) -> NewWindowResponse<tauri::Wry> {
  static NEXT: AtomicU32 = AtomicU32::new(1);
  let n = NEXT.fetch_add(1, Ordering::Relaxed);
  // The address and title it shows, kept together so either change rebuilds the whole title.
  let shown = Arc::new(Mutex::new((url.to_string(), None::<String>)));

  let on_load = shown.clone();
  let on_title = shown.clone();
  let opener = app.clone();
  let builder = WebviewWindowBuilder::new(app, label(n), WebviewUrl::External("about:blank".parse().expect("valid")))
    .window_features(features)
    .title(site::popup_title(url.as_str(), None))
    .general_autofill_enabled(false)
    .on_navigation(|url| url_policy::is_allowed_from_page(url.as_str()))
    .on_page_load(move |window, payload| {
      if matches!(payload.event(), PageLoadEvent::Started) {
        let mut shown = on_load.lock().unwrap();
        *shown = (payload.url().to_string(), None);
        let _ = window.set_title(&site::popup_title(&shown.0, None));
      }
    })
    .on_document_title_changed(move |window, title| {
      let mut shown = on_title.lock().unwrap();
      shown.1 = Some(title);
      let _ = window.set_title(&site::popup_title(&shown.0, shown.1.as_deref()));
    })
    .on_new_window(move |url, features| {
      if !url_policy::is_allowed_from_page(url.as_str()) {
        return NewWindowResponse::Deny;
      }
      if features.size().is_some() {
        return open(&opener, &url, features);
      }
      let app = opener.clone();
      tauri::async_runtime::spawn(async move {
        let _ = update(&app, |m, now| Ok(m.open_tab_from_page(url.to_string(), now)));
      });
      NewWindowResponse::Deny
    });
  let window = match builder.build() {
    Ok(window) => window,
    // Couldn't make a window: let WebView2 open its own plain one rather than lose the sign-in.
    Err(_) => return NewWindowResponse::Allow,
  };
  #[cfg(windows)]
  {
    let closing = window.clone();
    let _ = window.with_webview(move |pw| {
      // Its own prompts for camera and the like stay WebView2's: Ezel's prompt lives in the tab's peek.
      crate::webview2::quiet_defaults(&pw, None);
      // `window.close()` from the page (a finished sign-in): wry only drops the webview's own
      // container, which would leave an empty window behind. Close the whole window, after the
      // event returns (WebView2 doesn't allow reentrant calls from its handlers).
      crate::webview2::on_close_requested(&pw, move || {
        let window = closing.clone();
        let app = window.app_handle().clone();
        let _ = app.run_on_main_thread(move || {
          let _ = window.destroy();
        });
      });
    });
  }
  NewWindowResponse::Create { window }
}
