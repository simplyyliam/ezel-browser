//! WebView2 features Tauri doesn't expose. Each function takes the platform webview handed to
//! `Webview::with_webview`, so it runs on the main thread with a live controller.

use tauri::webview::PlatformWebview;

use std::cell::RefCell;

use crate::{
  browser::{page_menu::MenuTarget, permissions::SitePermission, site::PageError},
  hotkeys::KeyPress,
};
use webview2_com::{
  take_pwstr, AcceleratorKeyPressedEventHandler, BytesReceivedChangedEventHandler, CallDevToolsProtocolMethodCompletedHandler,
  ContainsFullScreenElementChangedEventHandler, ContextMenuRequestedEventHandler, DownloadStartingEventHandler, NavigationCompletedEventHandler,
  ProcessFailedEventHandler, StateChangedEventHandler, StatusBarTextChangedEventHandler,
  FaviconChangedEventHandler, FindActiveMatchIndexChangedEventHandler, FindMatchCountChangedEventHandler, FindStartCompletedHandler,
  IsDocumentPlayingAudioChangedEventHandler,
  GetProcessExtendedInfosCompletedHandler, PermissionRequestedEventHandler, ServerCertificateErrorDetectedEventHandler, TrySuspendCompletedHandler,
  WindowCloseRequestedEventHandler,
  Microsoft::Web::WebView2::Win32::{
    ICoreWebView2, ICoreWebView2ContextMenuRequestedEventArgs, ICoreWebView2Deferral, ICoreWebView2DownloadOperation,
    ICoreWebView2Environment13, ICoreWebView2_4, COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON, COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON_USER_CANCELED,
    COREWEBVIEW2_DOWNLOAD_STATE, COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED, COREWEBVIEW2_DOWNLOAD_STATE_IN_PROGRESS,
    COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE, COREWEBVIEW2_WEB_ERROR_STATUS,
    COREWEBVIEW2_WEB_ERROR_STATUS_CANNOT_CONNECT, COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_COMMON_NAME_IS_INCORRECT,
    COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_EXPIRED, COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_IS_INVALID,
    COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_REVOKED, COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED,
    COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_RESET, COREWEBVIEW2_WEB_ERROR_STATUS_DISCONNECTED,
    COREWEBVIEW2_WEB_ERROR_STATUS_HOST_NAME_NOT_RESOLVED, COREWEBVIEW2_WEB_ERROR_STATUS_SERVER_UNREACHABLE,
    COREWEBVIEW2_WEB_ERROR_STATUS_TIMEOUT,
    ICoreWebView2Environment15, ICoreWebView2Find, ICoreWebView2FrameInfo2, ICoreWebView2PermissionRequestedEventArgs,
    ICoreWebView2PermissionRequestedEventArgs3, COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ,
    COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    ICoreWebView2_11, ICoreWebView2_12, ICoreWebView2_28,
    COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND, COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_IMAGE,
    ICoreWebView2ProcessExtendedInfoCollection, ICoreWebView2Settings4, ICoreWebView2_14, ICoreWebView2_15, ICoreWebView2_19, ICoreWebView2_2,
    ICoreWebView2_20, ICoreWebView2_3, ICoreWebView2_8,
    COREWEBVIEW2_KEY_EVENT_KIND, COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS, COREWEBVIEW2_PERMISSION_STATE,
    COREWEBVIEW2_PERMISSION_STATE_DENY,
    COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN, COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL, COREWEBVIEW2_PHYSICAL_KEY_STATUS,
  },
};
use windows::{
  core::{Interface, HSTRING, PWSTR},
  Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CONTROL, VK_MENU, VK_SHIFT},
};

fn core(pw: &PlatformWebview) -> Option<ICoreWebView2> {
  // SAFETY: main thread, live controller.
  unsafe { pw.controller().CoreWebView2().ok() }
}

/// (can go back, can go forward).
pub fn history(pw: &PlatformWebview) -> (bool, bool) {
  let Some(core) = core(pw) else { return (false, false) };
  let (mut back, mut forward) = (Default::default(), Default::default());
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.CanGoBack(&mut back);
    let _ = core.CanGoForward(&mut forward);
  }
  (back.as_bool(), forward.as_bool())
}

/// Stops the page loading (Esc).
pub fn stop(pw: &PlatformWebview) {
  let Some(core) = core(pw) else { return };
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.Stop();
  }
}

/// Reloads the page bypassing the cache (Ctrl+Shift+R), through the DevTools protocol: WebView2
/// has no API of its own for it.
pub fn hard_reload(pw: &PlatformWebview) {
  let Some(core) = core(pw) else { return };
  let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(())));
  // SAFETY: main thread, live webview; the strings outlive the call.
  unsafe {
    let _ = core.CallDevToolsProtocolMethod(&HSTRING::from("Page.reload"), &HSTRING::from(r#"{"ignoreCache":true}"#), &handler);
  }
}

/// Clears everything a site stored (cookies, storage, caches, service workers) for one origin,
/// through the DevTools protocol (WebView2 has no per-site API). `origin` is built by Rust from
/// the tab's own URL (`scheme://host[:port]`), never from page or UI text. Then reloads the page,
/// so it starts fresh.
pub fn clear_site_data(pw: &PlatformWebview, origin: &str) {
  let Some(core) = core(pw) else { return };
  let params = serde_json::json!({ "origin": origin, "storageTypes": "all" }).to_string();
  let reload = core.clone();
  let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |_, _| {
    // SAFETY: WebView2 calls this on the main thread; `reload` is a live reference to the webview.
    unsafe {
      let _ = reload.Reload();
    }
    Ok(())
  }));
  // SAFETY: main thread, live webview; the strings outlive the call.
  unsafe {
    let _ = core.CallDevToolsProtocolMethod(&HSTRING::from("Storage.clearDataForOrigin"), &HSTRING::from(params), &handler);
  }
}

/// Calls `f` with the request's address whenever a server certificate can't be verified
/// (WebView2 1.0.1245+). WebView2's own action stays (its warning page, or cancelling a
/// subresource); `f` only records it.
pub fn on_certificate_error(pw: &PlatformWebview, f: impl Fn(String) + 'static) {
  let Some(core) = core(pw).and_then(|c| c.cast::<ICoreWebView2_14>().ok()) else { return };
  let handler = ServerCertificateErrorDetectedEventHandler::create(Box::new(move |_, args| {
    let Some(args) = args else { return Ok(()) };
    let mut uri = PWSTR::null();
    // SAFETY: WebView2 calls this on the main thread with live event args; take_pwstr frees the string.
    unsafe { args.RequestUri(&mut uri)? };
    f(take_pwstr(uri));
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.add_ServerCertificateErrorDetected(&handler, &mut token);
  }
}

/// The page's find session (WebView2 1.0.2849+; `None` on older runtimes).
fn find(pw: &PlatformWebview) -> Option<ICoreWebView2Find> {
  // SAFETY: main thread, live webview.
  core(pw).and_then(|c| c.cast::<ICoreWebView2_28>().ok()).and_then(|c| unsafe { c.Find() }.ok())
}

/// Starts finding `term` in the page (all matches highlighted, the first one active, WebView2's
/// own find bar suppressed). Returns false when the runtime has no find API.
pub fn find_start(pw: &PlatformWebview, term: &str) -> bool {
  let (Some(find), Some(env)) = (
    find(pw),
    core(pw)
      .and_then(|c| c.cast::<ICoreWebView2_2>().ok())
      // SAFETY: main thread, live webview.
      .and_then(|c| unsafe { c.Environment() }.ok())
      .and_then(|e| e.cast::<ICoreWebView2Environment15>().ok()),
  ) else {
    return false;
  };
  // SAFETY: main thread; the options and strings outlive the call.
  unsafe {
    let Ok(options) = env.CreateFindOptions() else { return false };
    let _ = options.SetFindTerm(&HSTRING::from(term));
    let _ = options.SetShouldHighlightAllMatches(true);
    let _ = options.SetSuppressDefaultFindDialog(true);
    let handler = FindStartCompletedHandler::create(Box::new(|_| Ok(())));
    find.Start(&options, &handler).is_ok()
  }
}

/// The next (or previous) match becomes active.
pub fn find_next(pw: &PlatformWebview, backward: bool) {
  let Some(find) = find(pw) else { return };
  // SAFETY: main thread, live find session.
  unsafe {
    let _ = if backward { find.FindPrevious() } else { find.FindNext() };
  }
}

/// Ends the find session and clears its highlights.
pub fn find_stop(pw: &PlatformWebview) {
  let Some(find) = find(pw) else { return };
  // SAFETY: main thread, live find session.
  unsafe {
    let _ = find.Stop();
  }
}

/// Calls `f(active match, match count)` whenever either changes (active is 1-based, 0 for none).
pub fn on_find_changed(pw: &PlatformWebview, f: impl Fn(i32, i32) + 'static) {
  let Some(session) = find(pw) else { return };
  let f = std::rc::Rc::new(f);
  let read = |find: &ICoreWebView2Find| {
    let (mut index, mut count) = (0i32, 0i32);
    // SAFETY: main thread, live find session.
    unsafe {
      let _ = find.ActiveMatchIndex(&mut index);
      let _ = find.MatchCount(&mut count);
    }
    (index, count)
  };
  let (on_count, on_index) = (f.clone(), f);
  let count_handler = FindMatchCountChangedEventHandler::create(Box::new(move |sender, _| {
    if let Some(find) = sender {
      let (index, count) = read(&find);
      on_count(index, count);
    }
    Ok(())
  }));
  let index_handler = FindActiveMatchIndexChangedEventHandler::create(Box::new(move |sender, _| {
    if let Some(find) = sender {
      let (index, count) = read(&find);
      on_index(index, count);
    }
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live find session.
  unsafe {
    let _ = session.add_MatchCountChanged(&count_handler, &mut token);
    let _ = session.add_ActiveMatchIndexChanged(&index_handler, &mut token);
  }
}

/// What a download reports: where it's saved, how far it got, how it ended.
pub enum DownloadEvent {
  Progress { received: u64, total: Option<u64> },
  /// `cancelled`: by the user; otherwise it completed (`completed`) or failed.
  Ended { completed: bool, cancelled: bool, path: String },
}

thread_local! {
  /// Running downloads' operations by Ezel's id: kept alive (their events need them) and
  /// cancellable from a command. Main thread only, like every COM object.
  static DOWNLOADS: RefCell<std::collections::HashMap<u32, ICoreWebView2DownloadOperation>> = RefCell::new(Default::default());
}

/// A size WebView2 reports: -1 (or less) is unknown.
fn bytes(value: i64) -> Option<u64> {
  u64::try_from(value).ok()
}

/// Downloads start in Ezel's list instead of WebView2's flyout (`Handled`). `start(path, total)`
/// returns Ezel's id for it; `event(id, …)` then hears its progress and its end. The file goes
/// where WebView2 puts it (the Downloads folder unless the page's Save As picked one).
pub fn on_download_starting(
  pw: &PlatformWebview,
  start: impl Fn(String, Option<u64>) -> u32 + 'static,
  event: impl Fn(u32, DownloadEvent) + 'static,
) {
  let Some(core) = core(pw).and_then(|c| c.cast::<ICoreWebView2_4>().ok()) else { return };
  let event = std::rc::Rc::new(event);
  let handler = DownloadStartingEventHandler::create(Box::new(move |_, args| {
    let Some(args) = args else { return Ok(()) };
    // SAFETY: WebView2 calls this on the main thread with live args; the operation is kept in
    // DOWNLOADS for as long as its handlers may run; take_pwstr frees every string.
    unsafe {
      args.SetHandled(true)?;
      let operation = args.DownloadOperation()?;
      let mut path = PWSTR::null();
      args.ResultFilePath(&mut path)?;
      let mut total = -1i64;
      let _ = operation.TotalBytesToReceive(&mut total);
      let id = start(take_pwstr(path), bytes(total));

      let on_bytes = event.clone();
      let progress = BytesReceivedChangedEventHandler::create(Box::new(move |sender, _| {
        if let Some(op) = sender {
          let (mut received, mut total) = (0i64, -1i64);
          let _ = op.BytesReceived(&mut received);
          let _ = op.TotalBytesToReceive(&mut total);
          on_bytes(id, DownloadEvent::Progress { received: bytes(received).unwrap_or(0), total: bytes(total) });
        }
        Ok(())
      }));
      let on_state = event.clone();
      let state = StateChangedEventHandler::create(Box::new(move |sender, _| {
        let Some(op) = sender else { return Ok(()) };
        let mut state = COREWEBVIEW2_DOWNLOAD_STATE::default();
        op.State(&mut state)?;
        if state == COREWEBVIEW2_DOWNLOAD_STATE_IN_PROGRESS {
          return Ok(());
        }
        let mut reason = COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON::default();
        let _ = op.InterruptReason(&mut reason);
        let mut path = PWSTR::null();
        let path = op.ResultFilePath(&mut path).map(|_| take_pwstr(path)).unwrap_or_default();
        on_state(id, DownloadEvent::Ended {
          completed: state == COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED,
          cancelled: reason == COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON_USER_CANCELED,
          path,
        });
        // Done: let the operation go once this handler has returned (it's still the sender here).
        DOWNLOADS.with(|d| d.borrow_mut().remove(&id));
        Ok(())
      }));
      let mut token = 0i64;
      let _ = operation.add_BytesReceivedChanged(&progress, &mut token);
      let _ = operation.add_StateChanged(&state, &mut token);
      DOWNLOADS.with(|d| d.borrow_mut().insert(id, operation));
    }
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.add_DownloadStarting(&handler, &mut token);
  }
}

/// Cancels a running download (main thread). A no-op once it has ended.
pub fn cancel_download(id: u32) {
  let operation = DOWNLOADS.with(|d| d.borrow().get(&id).cloned());
  if let Some(operation) = operation {
    // SAFETY: main thread; the clone keeps the operation alive for the call.
    unsafe {
      let _ = operation.Cancel();
    }
  }
}

/// A right-click in a page, for Ezel's own menu.
pub struct MenuRequest {
  /// Where, in the webview's own physical pixels.
  pub x: i32,
  pub y: i32,
  /// What was clicked (history comes from the runtime).
  pub target: MenuTarget,
  /// WebView2's own items for it (`Name`, enabled), top level only.
  pub native: Vec<(String, bool)>,
}

/// The right-click WebView2 is waiting on: its args (to pick a command) and deferral (to finish).
/// COM objects live on the main thread only, so this does too. One at a time: a new right-click
/// finishes the previous one first.
struct PendingMenu {
  args: ICoreWebView2ContextMenuRequestedEventArgs,
  deferral: ICoreWebView2Deferral,
  /// (`Name`, `CommandId`) of WebView2's items.
  commands: Vec<(String, i32)>,
}

thread_local! {
  static PENDING_MENU: RefCell<Option<PendingMenu>> = const { RefCell::new(None) };
}

/// Right-clicks in the page open Ezel's menu instead of WebView2's (WebView2's documented custom
/// menu: handled, with a deferral kept until the choice). `f` gets the request; the menu is then
/// finished with [`finish_menu`]. WebView2 1.0.1185+; older runtimes keep their own menu.
pub fn on_context_menu(pw: &PlatformWebview, f: impl Fn(MenuRequest) + 'static) {
  let Some(core) = core(pw).and_then(|c| c.cast::<ICoreWebView2_11>().ok()) else { return };
  let handler = ContextMenuRequestedEventHandler::create(Box::new(move |_, args| {
    let Some(args) = args else { return Ok(()) };
    // SAFETY: WebView2 calls this on the main thread with live args; every string is freed by
    // take_pwstr, and the collection is held while its items are read.
    let request = unsafe {
      let target = args.ContextMenuTarget()?;
      let flag = |get: &dyn Fn(*mut windows::core::BOOL) -> windows::core::Result<()>| {
        let mut value = windows::core::BOOL::default();
        get(&mut value).is_ok() && value.as_bool()
      };
      let text = |get: &dyn Fn(*mut PWSTR) -> windows::core::Result<()>| {
        let mut value = PWSTR::null();
        get(&mut value).ok().map(|_| take_pwstr(value)).filter(|s| !s.is_empty())
      };
      let mut kind = COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND::default();
      target.Kind(&mut kind)?;
      let menu_target = MenuTarget {
        is_image: kind == COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_IMAGE,
        editable: flag(&|v| target.IsEditable(v)),
        link: if flag(&|v| target.HasLinkUri(v)) { text(&|v| target.LinkUri(v)) } else { None },
        image: if flag(&|v| target.HasSourceUri(v)) { text(&|v| target.SourceUri(v)) } else { None },
        selection: if flag(&|v| target.HasSelection(v)) { text(&|v| target.SelectionText(v)) } else { None },
        can_go_back: false,
        can_go_forward: false,
      };
      let items = args.MenuItems()?;
      let mut count = 0u32;
      items.Count(&mut count)?;
      let mut native = vec![];
      let mut commands = vec![];
      for i in 0..count {
        let Ok(item) = items.GetValueAtIndex(i) else { continue };
        let Some(name) = text(&|v| item.Name(v)) else { continue };
        let mut id = 0i32;
        if item.CommandId(&mut id).is_err() {
          continue;
        }
        native.push((name.clone(), flag(&|v| item.IsEnabled(v))));
        commands.push((name, id));
      }
      let mut at = windows::Win32::Foundation::POINT::default();
      args.Location(&mut at)?;
      args.SetHandled(true)?;
      let deferral = args.GetDeferral()?;
      finish_menu(None);
      PENDING_MENU.with(|p| *p.borrow_mut() = Some(PendingMenu { args: args.clone(), deferral, commands }));
      MenuRequest { x: at.x, y: at.y, target: menu_target, native }
    };
    f(request);
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.add_ContextMenuRequested(&handler, &mut token);
  }
}

/// Finishes the waiting right-click (main thread): runs WebView2's item called `native` on what
/// was right-clicked, or nothing. A no-op when nothing waits.
pub fn finish_menu(native: Option<&str>) {
  let Some(pending) = PENDING_MENU.with(|p| p.borrow_mut().take()) else { return };
  // SAFETY: main thread; the args and deferral were kept alive in PENDING_MENU until now.
  unsafe {
    if let Some(id) = native.and_then(|name| pending.commands.iter().find(|(n, _)| n == name)).map(|(_, id)| *id) {
      let _ = pending.args.SetSelectedCommandId(id);
    }
    let _ = pending.deferral.Complete();
  }
}

/// Calls `f` when the page asks to close its window (`window.close()` in a popup).
pub fn on_close_requested(pw: &PlatformWebview, f: impl Fn() + 'static) {
  let Some(core) = core(pw) else { return };
  let handler = WindowCloseRequestedEventHandler::create(Box::new(move |_, _| {
    f();
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.add_WindowCloseRequested(&handler, &mut token);
  }
}

/// Opens the page's DevTools in their own window (F12). The tab must be built with `devtools(true)`.
pub fn open_devtools(pw: &PlatformWebview) {
  let Some(core) = core(pw) else { return };
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.OpenDevToolsWindow();
  }
}

/// How a permission request is answered.
pub enum PermissionAnswer {
  Allow,
  Deny,
  /// Ezel's prompt asks; WebView2 waits until [`answer_permission`] with this id.
  Ask(u32),
}

/// The kinds Ezel's own prompt handles.
fn site_permission(kind: COREWEBVIEW2_PERMISSION_KIND) -> Option<SitePermission> {
  Some(match kind {
    COREWEBVIEW2_PERMISSION_KIND_CAMERA => SitePermission::Camera,
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE => SitePermission::Microphone,
    COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION => SitePermission::Location,
    COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ => SitePermission::Clipboard,
    _ => return None,
  })
}

/// What Ezel answers without asking anyone: notifications are always declined (calm: no "allow
/// notifications?" prompts). `None`: not decided here.
fn quiet_permission(kind: COREWEBVIEW2_PERMISSION_KIND) -> Option<COREWEBVIEW2_PERMISSION_STATE> {
  (kind == COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS).then_some(COREWEBVIEW2_PERMISSION_STATE_DENY)
}

thread_local! {
  /// Requests waiting for the user's answer: their args and deferral (main thread only).
  static PENDING_PERMISSIONS: RefCell<std::collections::HashMap<u32, (ICoreWebView2PermissionRequestedEventArgs, ICoreWebView2Deferral)>> =
    RefCell::new(Default::default());
}

/// Sets the answer on a request: never saved in WebView2's profile (Ezel remembers, so it can list
/// and revoke).
unsafe fn set_permission(args: &ICoreWebView2PermissionRequestedEventArgs, allow: bool) {
  // SAFETY: main thread, live args (the caller's).
  unsafe {
    if let Ok(args3) = args.cast::<ICoreWebView2PermissionRequestedEventArgs3>() {
      let _ = args3.SetSavesInProfile(false);
    }
    let _ = args.SetState(if allow { COREWEBVIEW2_PERMISSION_STATE_ALLOW } else { COREWEBVIEW2_PERMISSION_STATE_DENY });
  }
}

/// Answers a request Ezel's prompt asked about (main thread). A no-op if it was already answered.
pub fn answer_permission(id: u32, allow: bool) {
  let Some((args, deferral)) = PENDING_PERMISSIONS.with(|p| p.borrow_mut().remove(&id)) else { return };
  // SAFETY: main thread; the args and deferral were kept alive until now.
  unsafe {
    set_permission(&args, allow);
    let _ = deferral.Complete();
  }
}

/// Quiet defaults for a tab or popup (docs/design/decisions.md, "Quiet defaults"): no password
/// saving (the "Save password?" bubble), notifications declined without a prompt. General
/// autofill is off through the builder (`general_autofill_enabled`); autoplay with sound through
/// the browser arguments. `ask`: Ezel's own prompt for camera, microphone, location and the
/// clipboard (tabs); without it (popups) those keep WebView2's prompt. `ask` gets the requesting
/// address and kind.
// TODO: turn password saving back on with the passwords UI.
pub fn quiet_defaults(pw: &PlatformWebview, ask: Option<Box<dyn Fn(String, SitePermission) -> PermissionAnswer>>) {
  let Some(core) = core(pw) else { return };
  // SAFETY: main thread, live webview.
  unsafe {
    if let Ok(settings) = core.Settings().and_then(|s| s.cast::<ICoreWebView2Settings4>()) {
      let _ = settings.SetIsPasswordAutosaveEnabled(false);
      let _ = settings.SetIsGeneralAutofillEnabled(false);
    }
  }
  let handler = PermissionRequestedEventHandler::create(Box::new(move |_, args| {
    let Some(args) = args else { return Ok(()) };
    // SAFETY: WebView2 calls this on the main thread with live event args; take_pwstr frees the
    // string; a deferred request's args are kept in PENDING_PERMISSIONS until answered.
    unsafe {
      let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
      args.PermissionKind(&mut kind)?;
      if let Some(state) = quiet_permission(kind) {
        if let Ok(args3) = args.cast::<ICoreWebView2PermissionRequestedEventArgs3>() {
          let _ = args3.SetSavesInProfile(false);
        }
        args.SetState(state)?;
        return Ok(());
      }
      let (Some(ask), Some(permission)) = (ask.as_ref(), site_permission(kind)) else { return Ok(()) };
      let mut uri = PWSTR::null();
      args.Uri(&mut uri)?;
      match ask(take_pwstr(uri), permission) {
        PermissionAnswer::Allow => set_permission(&args, true),
        PermissionAnswer::Deny => set_permission(&args, false),
        PermissionAnswer::Ask(id) => {
          let deferral = args.GetDeferral()?;
          PENDING_PERMISSIONS.with(|p| p.borrow_mut().insert(id, (args.clone(), deferral)));
        }
      }
    }
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.add_PermissionRequested(&handler, &mut token);
  }
}

/// The page's main-frame id (WebView2 1.0.2210+), the id WebView2's process list uses for the
/// frames each process renders. `None` before the first navigation (WebView2 reports 0 then).
pub fn main_frame_id(pw: &PlatformWebview) -> Option<u32> {
  let core = core(pw)?.cast::<ICoreWebView2_20>().ok()?;
  let mut id = 0u32;
  // SAFETY: main thread, live webview.
  unsafe { core.FrameId(&mut id).ok()? };
  (id != 0).then_some(id)
}

/// Lists every process of the WebView2 environment (WebView2 1.0.2420+) with the top-level frame
/// ids of the frames it renders, then calls `done` on the main thread: `None` if WebView2 can't
/// answer (an older runtime, a failed call, a failed callback).
pub fn process_frames(pw: &PlatformWebview, done: impl FnOnce(Option<Vec<(u32, Vec<u32>)>>) + 'static) {
  let env = core(pw)
    .and_then(|c| c.cast::<ICoreWebView2_2>().ok())
    // SAFETY: main thread, live webview.
    .and_then(|c| unsafe { c.Environment() }.ok())
    .and_then(|e| e.cast::<ICoreWebView2Environment13>().ok());
  let Some(env) = env else { return done(None) };
  // The handler may never run if the call fails, so `done` is shared with the failure path below.
  let done = std::rc::Rc::new(std::cell::Cell::new(Some(done)));
  let answer = done.clone();
  let handler = GetProcessExtendedInfosCompletedHandler::create(Box::new(move |result, list| {
    let processes = match (result, list) {
      // SAFETY: WebView2 calls this on the main thread with a live collection.
      (Ok(()), Some(list)) => Some(unsafe { read_processes(&list) }),
      _ => None,
    };
    if let Some(done) = answer.take() {
      done(processes);
    }
    Ok(())
  }));
  // SAFETY: main thread, live environment.
  if unsafe { env.GetProcessExtendedInfos(&handler) }.is_err() {
    if let Some(done) = done.take() {
      done(None);
    }
  }
}

/// More frames than any real page has; only guards the loop against a runtime that never ends it.
const MAX_FRAMES_PER_PROCESS: usize = 4096;

/// (process id, top-level frame ids) per process. Each frame is followed up to its top-level frame,
/// so a cross-site iframe's process counts for the tab whose page holds it. Every call's result is
/// checked; a process that can't be read is left out, its frames that can't be read are skipped.
///
/// Why unsafe: WebView2's COM interfaces are only reachable through these raw calls.
/// SAFETY: called from the completion handler, on the main thread, with the live collection
/// WebView2 passed in. Every COM object is held in a local for as long as anything derived from it
/// is used (see the frame collection below).
unsafe fn read_processes(list: &ICoreWebView2ProcessExtendedInfoCollection) -> Vec<(u32, Vec<u32>)> {
  let mut count = 0u32;
  if unsafe { list.Count(&mut count) }.is_err() {
    return vec![];
  }
  (0..count)
    .filter_map(|i| {
      let info = unsafe { list.GetValueAtIndex(i) }.ok()?;
      let mut pid = 0i32;
      unsafe { info.ProcessInfo().ok()?.ProcessId(&mut pid).ok()? };
      let mut roots = vec![];
      // Keep the collection alive while its iterator is used: WebView2's iterator doesn't hold a
      // reference to it, so dropping it after `GetIterator` (as this code once did) left
      // `GetCurrent` reading freed memory and crashed the app (STATUS_ACCESS_VIOLATION).
      let collection = unsafe { info.AssociatedFrameInfos() }.ok();
      if let Some(frames) = collection.as_ref().and_then(|c| unsafe { c.GetIterator() }.ok()) {
        let mut has = Default::default();
        let mut seen = 0;
        while seen < MAX_FRAMES_PER_PROCESS && unsafe { frames.HasCurrent(&mut has) }.is_ok() && has.as_bool() {
          seen += 1;
          if let Some(root) = unsafe { frames.GetCurrent() }.ok().and_then(|f| f.cast::<ICoreWebView2FrameInfo2>().ok()).and_then(|f| unsafe { top_frame_id(f) }) {
            if !roots.contains(&root) {
              roots.push(root);
            }
          }
          if unsafe { frames.MoveNext(&mut has) }.is_err() {
            break;
          }
        }
      }
      Some((pid as u32, roots))
    })
    .collect()
}

/// The id of the top-level frame above `frame` (itself if it's one).
unsafe fn top_frame_id(mut frame: ICoreWebView2FrameInfo2) -> Option<u32> {
  // Frames nest a few levels at most; the cap only guards against a malformed chain.
  for _ in 0..32 {
    match unsafe { frame.ParentFrameInfo() }.ok().and_then(|p| p.cast::<ICoreWebView2FrameInfo2>().ok()) {
      Some(parent) => frame = parent,
      None => break,
    }
  }
  let mut id = 0u32;
  unsafe { frame.FrameId(&mut id).ok()? };
  (id != 0).then_some(id)
}

/// Freezes a hidden webview (WebView2 1.0.705+): its scripts and timers stop and WebView2 trims its
/// memory. Fails harmlessly if the page is visible or can't be suspended (WebView2 decides).
pub fn try_suspend(pw: &PlatformWebview) {
  let Some(core) = core(pw).and_then(|c| c.cast::<ICoreWebView2_3>().ok()) else { return };
  let handler = TrySuspendCompletedHandler::create(Box::new(|_, _| Ok(())));
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.TrySuspend(&handler);
  }
}

/// Wakes a suspended webview (a no-op if it isn't). WebView2 also resumes it when it's shown.
pub fn resume(pw: &PlatformWebview) {
  let Some(core) = core(pw).and_then(|c| c.cast::<ICoreWebView2_3>().ok()) else { return };
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.Resume();
  }
}

/// Hidden tabs ask WebView2 to trim memory (it may swap out or drop caches); the shown tab gets
/// the normal level back. WebView2 1.0.1774+; ignored on older runtimes.
pub fn set_low_memory(pw: &PlatformWebview, low: bool) {
  let Some(core) = core(pw).and_then(|c| c.cast::<ICoreWebView2_19>().ok()) else { return };
  let level = if low { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL };
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.SetMemoryUsageTargetLevel(level);
  }
}

/// Ezel draws the hovered link's address itself (the link status pill): WebView2's own status
/// bubble is turned off, and `f` gets its text whenever it changes (empty: nothing to show).
pub fn on_status_text(pw: &PlatformWebview, f: impl Fn(String) + 'static) {
  let Some(core) = core(pw) else { return };
  // SAFETY: main thread, live webview.
  unsafe {
    if let Ok(settings) = core.Settings() {
      let _ = settings.SetIsStatusBarEnabled(false);
    }
  }
  let Ok(core) = core.cast::<ICoreWebView2_12>() else { return };
  let handler = StatusBarTextChangedEventHandler::create(Box::new(move |sender, _| {
    let Some(sender) = sender.and_then(|s| s.cast::<ICoreWebView2_12>().ok()) else { return Ok(()) };
    let mut text = PWSTR::null();
    // SAFETY: WebView2 calls this on the main thread; take_pwstr frees the string.
    unsafe { sender.StatusBarText(&mut text)? };
    f(take_pwstr(text));
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.add_StatusBarTextChanged(&handler, &mut token);
  }
}

/// Calls `f` whenever the page enters or leaves HTML fullscreen (a video's fullscreen button,
/// `requestFullscreen`).
pub fn on_fullscreen_changed(pw: &PlatformWebview, f: impl Fn(bool) + 'static) {
  let Some(core) = core(pw) else { return };
  let handler = ContainsFullScreenElementChangedEventHandler::create(Box::new(move |sender, _| {
    let Some(sender) = sender else { return Ok(()) };
    let mut full = windows::core::BOOL::default();
    // SAFETY: WebView2 calls this on the main thread with a live sender.
    unsafe { sender.ContainsFullScreenElement(&mut full)? };
    f(full.as_bool());
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.add_ContainsFullScreenElementChanged(&handler, &mut token);
  }
}

/// The page Ezel draws for a failed navigation, or `None` to leave WebView2's (SmartScreen's
/// warnings, a cancelled load, a sign-in prompt, anything unknown).
fn page_error_for(status: COREWEBVIEW2_WEB_ERROR_STATUS) -> Option<PageError> {
  Some(match status {
    COREWEBVIEW2_WEB_ERROR_STATUS_DISCONNECTED => PageError::Offline,
    COREWEBVIEW2_WEB_ERROR_STATUS_HOST_NAME_NOT_RESOLVED => PageError::NotFound,
    COREWEBVIEW2_WEB_ERROR_STATUS_CANNOT_CONNECT
    | COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED
    | COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_RESET
    | COREWEBVIEW2_WEB_ERROR_STATUS_SERVER_UNREACHABLE => PageError::CantConnect,
    COREWEBVIEW2_WEB_ERROR_STATUS_TIMEOUT => PageError::TimedOut,
    COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_COMMON_NAME_IS_INCORRECT
    | COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_EXPIRED
    | COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_IS_INVALID
    | COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_REVOKED => PageError::Certificate,
    _ => return None,
  })
}

/// Calls `f` when a top-level navigation fails in a way Ezel shows its own page for.
pub fn on_navigation_failed(pw: &PlatformWebview, f: impl Fn(PageError) + 'static) {
  let Some(core) = core(pw) else { return };
  let handler = NavigationCompletedEventHandler::create(Box::new(move |_, args| {
    let Some(args) = args else { return Ok(()) };
    let mut success = windows::core::BOOL::default();
    let mut status = COREWEBVIEW2_WEB_ERROR_STATUS::default();
    // SAFETY: WebView2 calls this on the main thread with live args.
    unsafe {
      args.IsSuccess(&mut success)?;
      args.WebErrorStatus(&mut status)?;
    }
    if !success.as_bool() {
      if let Some(error) = page_error_for(status) {
        f(error);
      }
    }
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.add_NavigationCompleted(&handler, &mut token);
  }
}

/// Calls `f` when the page's own renderer quits or stops responding ("page crashed").
pub fn on_page_crashed(pw: &PlatformWebview, f: impl Fn() + 'static) {
  let Some(core) = core(pw) else { return };
  let handler = ProcessFailedEventHandler::create(Box::new(move |_, args| {
    let Some(args) = args else { return Ok(()) };
    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
    // SAFETY: WebView2 calls this on the main thread with live args.
    unsafe { args.ProcessFailedKind(&mut kind)? };
    if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED || kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE {
      f();
    }
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.add_ProcessFailed(&handler, &mut token);
  }
}

/// Calls `f` with the page's favicon URL whenever it changes (`None` = the page has none).
pub fn on_favicon_changed(pw: &PlatformWebview, f: impl Fn(Option<String>) + 'static) {
  let Some(core) = core(pw).and_then(|c| c.cast::<ICoreWebView2_15>().ok()) else { return };
  let handler = FaviconChangedEventHandler::create(Box::new(move |sender, _| {
    let Some(sender) = sender.and_then(|s| s.cast::<ICoreWebView2_15>().ok()) else { return Ok(()) };
    let mut uri = PWSTR::null();
    // SAFETY: WebView2 calls this on the main thread; take_pwstr frees the string it returns.
    unsafe { sender.FaviconUri(&mut uri)? };
    f(Some(take_pwstr(uri)).filter(|u| !u.is_empty()));
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.add_FaviconChanged(&handler, &mut token);
  }
}

/// Mutes or unmutes everything the page plays (WebView2 1.0.1072+).
pub fn set_muted(pw: &PlatformWebview, muted: bool) {
  let Some(core) = core(pw).and_then(|c| c.cast::<ICoreWebView2_8>().ok()) else { return };
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.SetIsMuted(muted);
  }
}

/// Calls `f` whenever the page starts or stops playing audio.
pub fn on_audio_changed(pw: &PlatformWebview, f: impl Fn(bool) + 'static) {
  let Some(core) = core(pw).and_then(|c| c.cast::<ICoreWebView2_8>().ok()) else { return };
  let handler = IsDocumentPlayingAudioChangedEventHandler::create(Box::new(move |sender, _| {
    let Some(sender) = sender.and_then(|s| s.cast::<ICoreWebView2_8>().ok()) else { return Ok(()) };
    let mut playing = Default::default();
    // SAFETY: WebView2 calls this on the main thread with a live sender.
    unsafe { sender.IsDocumentPlayingAudio(&mut playing)? };
    f(playing.as_bool());
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.add_IsDocumentPlayingAudioChanged(&handler, &mut token);
  }
}

/// App shortcuts pressed while the website has focus never reach the `ui` webview's JS, so catch
/// them here: `on_key` gets every key press (Alt combos included) and returns true for a shortcut,
/// which the page then never sees (no Ctrl+B "bold" in web editors).
pub fn forward_shortcuts(pw: &PlatformWebview, on_key: impl Fn(KeyPress) -> bool + 'static) {
  let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
    let Some(args) = args else { return Ok(()) };
    // SAFETY: WebView2 calls this on the UI thread with live event args.
    unsafe {
      let mut kind = COREWEBVIEW2_KEY_EVENT_KIND::default();
      args.KeyEventKind(&mut kind)?;
      // Alt combos arrive as system keys.
      if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN && kind != COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN {
        return Ok(());
      }
      let mut key = 0u32;
      args.VirtualKey(&mut key)?;
      let mut status = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
      args.PhysicalKeyStatus(&mut status)?;
      let held = |vk: u16| GetKeyState(vk as i32) < 0;
      let press = KeyPress {
        vk: key as u16,
        ctrl: held(VK_CONTROL.0),
        shift: held(VK_SHIFT.0),
        alt: held(VK_MENU.0),
        repeat: status.WasKeyDown.as_bool(),
      };
      if on_key(press) {
        args.SetHandled(true)?;
      }
    }
    Ok(())
  }));
  let mut token = 0i64;
  // SAFETY: main thread, live controller.
  unsafe {
    let _ = pw.controller().add_AcceleratorKeyPressed(&handler, &mut token);
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_known_failures_get_ezels_page() {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
      COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED, COREWEBVIEW2_WEB_ERROR_STATUS_UNKNOWN,
      COREWEBVIEW2_WEB_ERROR_STATUS_VALID_AUTHENTICATION_CREDENTIALS_REQUIRED,
    };
    assert_eq!(page_error_for(COREWEBVIEW2_WEB_ERROR_STATUS_DISCONNECTED), Some(PageError::Offline));
    assert_eq!(page_error_for(COREWEBVIEW2_WEB_ERROR_STATUS_HOST_NAME_NOT_RESOLVED), Some(PageError::NotFound));
    assert_eq!(page_error_for(COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_RESET), Some(PageError::CantConnect));
    assert_eq!(page_error_for(COREWEBVIEW2_WEB_ERROR_STATUS_TIMEOUT), Some(PageError::TimedOut));
    assert_eq!(page_error_for(COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_EXPIRED), Some(PageError::Certificate));
    // A stopped load (Esc, Ezel's own URL policy), a sign-in prompt, anything unknown (SmartScreen
    // among them): WebView2's own page, never Ezel's.
    for status in [COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED, COREWEBVIEW2_WEB_ERROR_STATUS_VALID_AUTHENTICATION_CREDENTIALS_REQUIRED, COREWEBVIEW2_WEB_ERROR_STATUS_UNKNOWN] {
      assert_eq!(page_error_for(status), None);
    }
  }

  #[test]
  fn notifications_are_denied_and_the_four_kinds_go_to_ezels_prompt() {
    use webview2_com::Microsoft::Web::WebView2::Win32::{COREWEBVIEW2_PERMISSION_KIND_MIDI_SYSTEM_EXCLUSIVE_MESSAGES, COREWEBVIEW2_PERMISSION_KIND_OTHER_SENSORS};
    assert_eq!(quiet_permission(COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS), Some(COREWEBVIEW2_PERMISSION_STATE_DENY));
    assert_eq!(site_permission(COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS), None);
    for kind in [COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION, COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ] {
      assert_eq!(quiet_permission(kind), None);
    }
    assert_eq!(site_permission(COREWEBVIEW2_PERMISSION_KIND_CAMERA), Some(SitePermission::Camera));
    assert_eq!(site_permission(COREWEBVIEW2_PERMISSION_KIND_MICROPHONE), Some(SitePermission::Microphone));
    assert_eq!(site_permission(COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION), Some(SitePermission::Location));
    assert_eq!(site_permission(COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ), Some(SitePermission::Clipboard));
    // Anything else keeps WebView2's own handling.
    for kind in [COREWEBVIEW2_PERMISSION_KIND_MIDI_SYSTEM_EXCLUSIVE_MESSAGES, COREWEBVIEW2_PERMISSION_KIND_OTHER_SENSORS] {
      assert_eq!(site_permission(kind), None);
    }
  }
}
