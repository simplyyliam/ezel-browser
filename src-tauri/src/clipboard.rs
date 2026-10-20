//! Writes text to the OS clipboard from Rust. Shortcuts pressed in the website (Ctrl+Shift+C) leave
//! keyboard focus there, and the `ui` webview's `navigator.clipboard` refuses to write without
//! focus, so the copy happens here instead.

use std::{thread, time::Duration};

use windows::Win32::{
  Foundation::{GlobalFree, HANDLE},
  System::{
    DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData},
    Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE},
  },
};

/// `CF_UNICODETEXT` (in `Win32_System_Ole`, a feature we otherwise don't need).
const CF_UNICODETEXT: u32 = 13;

/// Another app may hold the clipboard for a moment; try a few times before giving up.
const OPEN_ATTEMPTS: u32 = 5;

pub fn set_text(text: &str) -> windows::core::Result<()> {
  let wide: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
  // SAFETY: the buffer is sized for `wide`, locked while written, and handed to the clipboard
  // (which then owns it) or freed if that fails.
  unsafe {
    let mem = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2)?;
    let ptr = GlobalLock(mem) as *mut u16;
    if ptr.is_null() {
      let _ = GlobalFree(Some(mem));
      return Err(windows::core::Error::from_thread());
    }
    std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
    let _ = GlobalUnlock(mem);

    let mut opened = OpenClipboard(None);
    for _ in 1..OPEN_ATTEMPTS {
      if opened.is_ok() {
        break;
      }
      thread::sleep(Duration::from_millis(10));
      opened = OpenClipboard(None);
    }
    if let Err(e) = opened {
      let _ = GlobalFree(Some(mem));
      return Err(e);
    }
    let result = EmptyClipboard().and_then(|_| SetClipboardData(CF_UNICODETEXT, Some(HANDLE(mem.0))));
    let _ = CloseClipboard();
    if result.is_err() {
      let _ = GlobalFree(Some(mem));
    }
    result.map(|_| ())
  }
}
