//! WebView2 features Tauri doesn't expose. Each function takes the platform webview handed to
//! `Webview::with_webview`, so it runs on the main thread with a live controller.

use tauri::webview::PlatformWebview;

use crate::hotkeys::KeyPress;
use webview2_com::{
  take_pwstr, AcceleratorKeyPressedEventHandler, CallDevToolsProtocolMethodCompletedHandler, FaviconChangedEventHandler, IsDocumentPlayingAudioChangedEventHandler,
  Microsoft::Web::WebView2::Win32::{
    ICoreWebView2, ICoreWebView2_15, ICoreWebView2_19, ICoreWebView2_8, COREWEBVIEW2_KEY_EVENT_KIND,
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
