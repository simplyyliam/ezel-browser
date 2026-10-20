//! App shortcuts pressed while a website has focus. Tab webviews have no IPC and keep their keys
//! from the `ui` webview, so the frontend sends its shortcut list (`set_forwarded_hotkeys`) and the
//! platform webview code asks [`handle`] about every key press; matches become "hotkey-pressed".

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

use crate::{emit_to_ui, error::AppError, UI_LABEL};

/// One shortcut as the frontend describes it (`shared/hotkeys.ts`).
#[derive(Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ForwardedHotkey {
  id: String,
  /// Lowercase: "a"–"z", "0"–"9", "f1"–"f12", "tab", "escape", "left", "right".
  key: String,
  ctrl: bool,
  shift: bool,
  alt: bool,
  /// Move keyboard focus to the `ui` webview before emitting (shortcuts that open a field).
  focus_ui: bool,
  /// Caught only while the shown tab is loading; otherwise the page gets the key (Esc stops a load,
  /// but closes the website's own dialogs the rest of the time).
  while_loading: bool,
}

/// Payload of "hotkey-pressed": a forwarded shortcut was pressed while the website had focus.
#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "hotkey-pressed")]
pub struct HotkeyPressed {
  id: String,
}

/// A key press in a tab webview: Windows virtual-key code and the modifiers held.
#[derive(Clone, Copy)]
pub struct KeyPress {
  pub vk: u16,
  pub ctrl: bool,
  pub shift: bool,
  pub alt: bool,
  /// Auto-repeat while the key is held down.
  pub repeat: bool,
}

struct Hotkey {
  id: String,
  vk: u16,
  ctrl: bool,
  shift: bool,
  alt: bool,
  focus_ui: bool,
  while_loading: bool,
}

/// The current list (managed state). Empty until the frontend sends one: nothing is caught.
#[derive(Default)]
pub struct ForwardedHotkeys(Mutex<Vec<Hotkey>>);

/// Windows virtual-key code: letters and digits are their uppercase ASCII, F1 is 0x70.
fn virtual_key(key: &str) -> Option<u16> {
  match key {
    "tab" => return Some(0x09),
    "escape" => return Some(0x1B),
    "left" => return Some(0x25),
    "right" => return Some(0x27),
    _ => {}
  }
  match key.as_bytes() {
    [c @ (b'a'..=b'z' | b'0'..=b'9')] => Some(c.to_ascii_uppercase() as u16),
    [b'f', ..] => match key[1..].parse::<u16>() {
      Ok(n @ 1..=12) if !key[1..].starts_with('0') => Some(0x6F + n),
      _ => None,
    },
    _ => None,
  }
}

/// Replaces the shortcuts caught in the tab webviews (existing ones too: the list is read per key).
#[tauri::command]
#[specta::specta]
pub fn set_forwarded_hotkeys(state: State<ForwardedHotkeys>, hotkeys: Vec<ForwardedHotkey>) -> Result<(), AppError> {
  let list = hotkeys
    .into_iter()
    .map(|h| {
      let vk = virtual_key(&h.key).ok_or_else(|| AppError::invalid_input(format!("unsupported hotkey key {:?}", h.key)))?;
      Ok(Hotkey { id: h.id, vk, ctrl: h.ctrl, shift: h.shift, alt: h.alt, focus_ui: h.focus_ui, while_loading: h.while_loading })
    })
    .collect::<Result<Vec<_>, AppError>>()?;
  *state.0.lock().unwrap() = list;
  Ok(())
}

/// Called for each key press in a tab webview. Returns true when it's a forwarded shortcut, so the
/// page mustn't see it; a fresh press (not a repeat) also emits "hotkey-pressed".
pub fn handle(app: &AppHandle, key: KeyPress) -> bool {
  let found = {
    let state: State<ForwardedHotkeys> = app.state();
    let list = state.0.lock().unwrap();
    list
      .iter()
      .find(|h| h.vk == key.vk && h.ctrl == key.ctrl && h.shift == key.shift && h.alt == key.alt)
      .map(|h| (h.id.clone(), h.focus_ui, h.while_loading))
  };
  let Some((id, focus_ui, while_loading)) = found else { return false };
  if while_loading && !crate::browser::shown_is_loading(app) {
    return false;
  }
  if !key.repeat {
    // JS focus() in the UI can't take OS focus from another webview; the palette must get typing.
    if focus_ui {
      if let Some(ui) = app.get_webview(UI_LABEL) {
        let _ = ui.set_focus();
      }
    }
    emit_to_ui(app, &HotkeyPressed { id });
  }
  true
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn maps_supported_keys_to_virtual_keys() {
    assert_eq!(virtual_key("a"), Some(0x41));
    assert_eq!(virtual_key("z"), Some(0x5A));
    assert_eq!(virtual_key("0"), Some(0x30));
    assert_eq!(virtual_key("9"), Some(0x39));
    assert_eq!(virtual_key("f"), Some(0x46));
    assert_eq!(virtual_key("f1"), Some(0x70));
    assert_eq!(virtual_key("f12"), Some(0x7B));
    assert_eq!(virtual_key("f5"), Some(0x74));
    assert_eq!(virtual_key("tab"), Some(0x09));
    assert_eq!(virtual_key("escape"), Some(0x1B));
    assert_eq!(virtual_key("left"), Some(0x25));
    assert_eq!(virtual_key("right"), Some(0x27));
  }

  #[test]
  fn rejects_other_keys() {
    for key in ["", "A", "F1", "f0", "f13", "f01", "fx", "ab", "-", "enter", " ", "Tab", "arrowleft", "esc"] {
      assert_eq!(virtual_key(key), None, "{key:?}");
    }
  }
}
