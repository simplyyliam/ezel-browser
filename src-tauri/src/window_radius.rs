//! The corner radius Windows 11 draws for the main window, including the Windhawk
//! "Custom Window Corner Radius" mod if it's enabled.

use serde::Serialize;
use specta::Type;
use tauri_specta::Event;

/// Windows 11's own window radius, in logical px.
const WIN11_DEFAULT_RADIUS: u32 = 8;

/// What the UI gets (`get_window_radius`, "window-radius-changed"). `radius` is logical px; `None` =
/// unknown (not Windows), so the UI keeps its defaults.
#[derive(Clone, Copy, Default, PartialEq, Debug, Serialize, Type, Event)]
#[tauri_specta(event_name = "window-radius-changed")]
pub struct WindowRadius {
  pub radius: Option<u32>,
  /// True when the Windhawk mod sets the radius.
  pub customized: bool,
}

/// When the mod also rounds maximized / snapped windows (which Windows 11 squares off).
#[derive(Clone, Copy, Default, PartialEq, Debug)]
pub enum RoundMaximizedAndSnapped {
  #[default]
  None,
  Snapped,
  SnappedAndMaximized,
}

/// The mod's settings that matter for the main window radius.
#[derive(Clone, Copy, Default, PartialEq, Debug)]
pub struct ModSettings {
  /// Logical px (DWM scales it by DPI). `None` = mod off, missing, or radius left at the original (-1).
  pub radius: Option<u32>,
  pub round_maximized_and_snapped: RoundMaximizedAndSnapped,
}

#[derive(Clone, Copy, Default, Debug)]
pub struct WindowState {
  pub fullscreen: bool,
  pub maximized: bool,
  /// Snapped (arranged) but not maximized.
  pub snapped: bool,
}

/// The radius Windows 11 DWM draws for a window in `state`. Windows squares off fullscreen,
/// maximized and snapped windows unless the mod rounds them.
pub fn effective_radius(settings: ModSettings, state: WindowState) -> WindowRadius {
  use RoundMaximizedAndSnapped::*;
  let Some(radius) = settings.radius else {
    let squared = state.fullscreen || state.maximized || state.snapped;
    return WindowRadius { radius: Some(if squared { 0 } else { WIN11_DEFAULT_RADIUS }), customized: false };
  };
  let rounds = match (state.fullscreen, state.maximized, state.snapped) {
    (true, _, _) => false,
    (_, true, _) => settings.round_maximized_and_snapped == SnappedAndMaximized,
    (_, _, true) => matches!(settings.round_maximized_and_snapped, Snapped | SnappedAndMaximized),
    _ => true,
  };
  WindowRadius { radius: Some(if rounds { radius } else { 0 }), customized: true }
}

#[cfg(windows)]
pub use imp::{is_snapped, read_settings, watch};

#[cfg(not(windows))]
pub fn read_settings() -> ModSettings {
  ModSettings::default()
}

/// Nothing to watch off Windows.
#[cfg(not(windows))]
pub fn watch(_on_change: impl Fn() + Send + 'static) {}

#[cfg(windows)]
mod imp {
  use super::{ModSettings, RoundMaximizedAndSnapped};
  use windows::{
    core::{w, PCWSTR},
    Win32::{
      Foundation::{ERROR_SUCCESS, HWND},
      System::Registry::{
        RegCloseKey, RegGetValueW, RegNotifyChangeKeyValue, RegOpenKeyExW, HKEY, HKEY_LOCAL_MACHINE,
        KEY_NOTIFY, REG_NOTIFY_CHANGE_LAST_SET, REG_NOTIFY_CHANGE_NAME, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
      },
      UI::WindowsAndMessaging::{IsWindowArranged, IsZoomed},
    },
  };

  /// Parent of every Windhawk mod key; watching it also catches the mod being installed or removed.
  const MODS_KEY: PCWSTR = w!(r"SOFTWARE\Windhawk\Engine\Mods");
  const MOD_KEY: PCWSTR = w!(r"SOFTWARE\Windhawk\Engine\Mods\custom-corner-radius");
  const SETTINGS_KEY: PCWSTR = w!(r"SOFTWARE\Windhawk\Engine\Mods\custom-corner-radius\Settings");

  fn read_dword(subkey: PCWSTR, value: PCWSTR) -> Option<u32> {
    let mut data = 0u32;
    let mut size = size_of::<u32>() as u32;
    // SAFETY: `data` is a valid u32 buffer of `size` bytes.
    let status = unsafe {
      RegGetValueW(
        HKEY_LOCAL_MACHINE,
        subkey,
        value,
        RRF_RT_REG_DWORD,
        None,
        Some(&mut data as *mut u32 as *mut _),
        Some(&mut size),
      )
    };
    (status == ERROR_SUCCESS).then_some(data)
  }

  fn read_string(subkey: PCWSTR, value: PCWSTR) -> Option<String> {
    let mut buf = [0u16; 64];
    let mut size = size_of_val(&buf) as u32;
    // SAFETY: `buf` is a valid buffer of `size` bytes; RegGetValueW null-terminates REG_SZ data.
    let status = unsafe {
      RegGetValueW(
        HKEY_LOCAL_MACHINE,
        subkey,
        value,
        RRF_RT_REG_SZ,
        None,
        Some(buf.as_mut_ptr() as *mut _),
        Some(&mut size),
      )
    };
    if status != ERROR_SUCCESS {
      return None;
    }
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    Some(String::from_utf16_lossy(&buf[..len]))
  }

  pub fn read_settings() -> ModSettings {
    // A missing key or Disabled != 0 means the mod isn't active.
    if read_dword(MOD_KEY, w!("Disabled")) != Some(0) {
      return ModSettings::default();
    }
    // Stored as a DWORD, so the mod's -1 ("keep original") reads back as 4294967295.
    let radius = read_dword(SETTINGS_KEY, w!("radius")).filter(|&r| (r as i32) >= 0);
    let round_maximized_and_snapped = match read_string(SETTINGS_KEY, w!("roundMaximizedAndSnapped")).as_deref() {
      Some("snapped") => RoundMaximizedAndSnapped::Snapped,
      Some("snappedAndMaximized") => RoundMaximizedAndSnapped::SnappedAndMaximized,
      _ => RoundMaximizedAndSnapped::None,
    };
    ModSettings { radius, round_maximized_and_snapped }
  }

  /// Snapped (Aero Snap / Snap Layouts) but not maximized.
  pub fn is_snapped(hwnd: HWND) -> bool {
    // SAFETY: plain Win32 queries on a window handle; a stale handle just returns FALSE.
    unsafe { IsWindowArranged(hwnd).as_bool() && !IsZoomed(hwnd).as_bool() }
  }

  /// Calls `on_change` from a background thread whenever anything under the Windhawk mods key changes.
  /// Does nothing if Windhawk isn't installed. Stops if the key is deleted.
  pub fn watch(on_change: impl Fn() + Send + 'static) {
    let mut key = HKEY::default();
    // SAFETY: `key` receives the opened handle.
    if unsafe { RegOpenKeyExW(HKEY_LOCAL_MACHINE, MODS_KEY, None, KEY_NOTIFY, &mut key) } != ERROR_SUCCESS {
      return;
    }
    // HKEY is a raw pointer, so move its address across the thread boundary.
    let raw = key.0 as usize;
    std::thread::Builder::new()
      .name("windhawk-radius-watch".into())
      .spawn(move || {
        let key = HKEY(raw as *mut _);
        // Synchronous: blocks this thread until something in the subtree changes.
        // SAFETY: `key` stays open for the life of this loop and is closed only here.
        while unsafe {
          RegNotifyChangeKeyValue(key, true, REG_NOTIFY_CHANGE_NAME | REG_NOTIFY_CHANGE_LAST_SET, None, false)
        } == ERROR_SUCCESS
        {
          on_change();
        }
        on_change();
        unsafe {
          let _ = RegCloseKey(key);
        }
      })
      .ok();
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use RoundMaximizedAndSnapped::*;

  fn settings(radius: Option<u32>, round: RoundMaximizedAndSnapped) -> ModSettings {
    ModSettings { radius, round_maximized_and_snapped: round }
  }
  const NORMAL: WindowState = WindowState { fullscreen: false, maximized: false, snapped: false };
  const MAXIMIZED: WindowState = WindowState { fullscreen: false, maximized: true, snapped: false };
  const SNAPPED: WindowState = WindowState { fullscreen: false, maximized: false, snapped: true };
  const FULLSCREEN: WindowState = WindowState { fullscreen: true, maximized: true, snapped: false };

  fn r(radius: u32, customized: bool) -> WindowRadius {
    WindowRadius { radius: Some(radius), customized }
  }

  #[test]
  fn not_customized_follows_windows_defaults() {
    let off = settings(Option::None, SnappedAndMaximized);
    assert_eq!(effective_radius(off, NORMAL), r(8, false));
    for state in [MAXIMIZED, SNAPPED, FULLSCREEN] {
      assert_eq!(effective_radius(off, state), r(0, false));
    }
  }

  #[test]
  fn customized_follows_window_state() {
    let none = settings(Some(26), None);
    assert_eq!(effective_radius(none, NORMAL), r(26, true));
    assert_eq!(effective_radius(none, SNAPPED), r(0, true));
    assert_eq!(effective_radius(none, MAXIMIZED), r(0, true));

    let snapped = settings(Some(26), Snapped);
    assert_eq!(effective_radius(snapped, SNAPPED), r(26, true));
    assert_eq!(effective_radius(snapped, MAXIMIZED), r(0, true));

    let both = settings(Some(26), SnappedAndMaximized);
    assert_eq!(effective_radius(both, SNAPPED), r(26, true));
    assert_eq!(effective_radius(both, MAXIMIZED), r(26, true));
    assert_eq!(effective_radius(both, FULLSCREEN), r(0, true));
  }

  #[cfg(windows)]
  #[test]
  fn reads_registry_without_panicking() {
    println!("{:?}", read_settings());
  }
}
