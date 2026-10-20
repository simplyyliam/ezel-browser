//! WebView2 features Tauri doesn't expose. Each function takes the platform webview handed to
//! `Webview::with_webview`, so it runs on the main thread with a live controller.

use tauri::webview::PlatformWebview;

use crate::hotkeys::KeyPress;
use webview2_com::{
  take_pwstr, AcceleratorKeyPressedEventHandler, CallDevToolsProtocolMethodCompletedHandler, FaviconChangedEventHandler, IsDocumentPlayingAudioChangedEventHandler,
  GetProcessExtendedInfosCompletedHandler, PermissionRequestedEventHandler, TrySuspendCompletedHandler,
  Microsoft::Web::WebView2::Win32::{
    ICoreWebView2, ICoreWebView2Environment13, ICoreWebView2FrameInfo2, ICoreWebView2PermissionRequestedEventArgs3,
    ICoreWebView2ProcessExtendedInfoCollection, ICoreWebView2Settings4, ICoreWebView2_15, ICoreWebView2_19, ICoreWebView2_2,
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

/// Opens the page's DevTools in their own window (F12). The tab must be built with `devtools(true)`.
pub fn open_devtools(pw: &PlatformWebview) {
  let Some(core) = core(pw) else { return };
  // SAFETY: main thread, live webview.
  unsafe {
    let _ = core.OpenDevToolsWindow();
  }
}

/// What Ezel answers a website's permission request with, without asking: `None` leaves it to
/// WebView2 (its own prompt). Notifications are denied until there's a permissions UI (calm: no
/// "allow notifications?" prompts).
fn quiet_permission(kind: COREWEBVIEW2_PERMISSION_KIND) -> Option<COREWEBVIEW2_PERMISSION_STATE> {
  (kind == COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS).then_some(COREWEBVIEW2_PERMISSION_STATE_DENY)
}

/// Quiet defaults for a tab (docs/design/decisions.md, "Quiet defaults"): no password saving (the
/// "Save password?" bubble) and notification requests denied without a prompt, and not remembered
/// in the profile so a later permissions UI starts clean. General autofill is off through the
/// builder (`general_autofill_enabled`); autoplay with sound through the browser arguments.
// TODO: turn password saving back on with the passwords UI.
pub fn quiet_defaults(pw: &PlatformWebview) {
  let Some(core) = core(pw) else { return };
  // SAFETY: main thread, live webview.
  unsafe {
    if let Ok(settings) = core.Settings().and_then(|s| s.cast::<ICoreWebView2Settings4>()) {
      let _ = settings.SetIsPasswordAutosaveEnabled(false);
      let _ = settings.SetIsGeneralAutofillEnabled(false);
    }
  }
  let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
    let Some(args) = args else { return Ok(()) };
    // SAFETY: WebView2 calls this on the main thread with live event args.
    unsafe {
      let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
      args.PermissionKind(&mut kind)?;
      if let Some(state) = quiet_permission(kind) {
        if let Ok(args3) = args.cast::<ICoreWebView2PermissionRequestedEventArgs3>() {
          let _ = args3.SetSavesInProfile(false);
        }
        args.SetState(state)?;
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
  use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ, COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION,
  };

  #[test]
  fn notifications_are_denied_and_everything_else_left_to_webview2() {
    assert_eq!(quiet_permission(COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS), Some(COREWEBVIEW2_PERMISSION_STATE_DENY));
    for kind in [COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION, COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ] {
      assert_eq!(quiet_permission(kind), None);
    }
  }
}
