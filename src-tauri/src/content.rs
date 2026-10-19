//! Where the website is drawn: the bounds, rounded corners, cutouts and visibility the frontend
//! reports, applied to whichever tab webview is shown. Every tab shares one shape, so switching
//! tabs only re-applies it to the incoming webview.

use std::{collections::BTreeMap, sync::Mutex};

use serde::Deserialize;
use specta::Type;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Rect, State, Webview};

use crate::{browser, error::AppError};

/// Last reported content bounds, corner radii, cutouts and visibility, in logical px. Rust rebuilds the clip region from these.
#[derive(Default)]
pub struct ContentShape {
  x: f64,
  y: f64,
  width: f64,
  height: f64,
  /// CSS order: top-left, top-right, bottom-right, bottom-left.
  radii: [f64; 4],
  /// Holes cut out of the page so the UI below shows through, keyed by owner ("titlebar", "sidebar").
  cutouts: BTreeMap<String, Cutout>,
  /// The frontend's `set_content_visible`. The website starts hidden until bounds are reported.
  visible: bool,
}

// Exported as TS `number`: specta maps f64 to `number | null` (NaN and infinities serialize as null).
/// Logical px.
#[derive(Clone, Copy, Deserialize, Type)]
#[serde(transparent)]
pub struct Px(#[specta(type = specta_typescript::Number)] f64);

/// A window-relative rounded rect, logical px.
#[derive(Clone, Copy)]
struct Cutout {
  rect: [f64; 4],
  radius: f64,
}

fn bounds(shape: &ContentShape) -> Rect {
  Rect {
    position: LogicalPosition::new(shape.x, shape.y).into(),
    size: LogicalSize::new(shape.width, shape.height).into(),
  }
}

/// Places a tab's webview where the website goes and shows it (if the website is visible).
/// Called when a tab becomes the shown one.
pub fn present(webview: &Webview) {
  let (rect, visible) = {
    let shape: State<Mutex<ContentShape>> = webview.state();
    let s = shape.lock().unwrap();
    (bounds(&s), s.visible)
  };
  let _ = webview.set_bounds(rect);
  apply_shape(webview);
  let _ = if visible { webview.show() } else { webview.hide() };
}

/// Places the content webview. Logical px, relative to the window's top-left. Reported by the frontend.
#[tauri::command]
#[specta::specta]
pub fn set_content_bounds(app: AppHandle, x: Px, y: Px, width: Px, height: Px) -> Result<(), AppError> {
  let [x, y, width, height] = [x.0, y.0, width.0, height.0];
  if ![x, y, width, height].iter().all(|v| v.is_finite()) {
    return Err(AppError::invalid_input("bounds must be finite numbers"));
  }
  let (width, height) = (width.max(0.0), height.max(0.0));
  let rect = {
    let shape: State<Mutex<ContentShape>> = app.state();
    let mut shape = shape.lock().unwrap();
    (shape.x, shape.y, shape.width, shape.height) = (x, y, width, height);
    bounds(&shape)
  };
  if let Some(webview) = browser::shown_webview(&app) {
    webview.set_bounds(rect)?;
    apply_shape(&webview);
  }
  Ok(())
}

/// Rounds the content webview's corners. Logical px, CSS order: top-left, top-right, bottom-right, bottom-left.
#[tauri::command]
#[specta::specta]
pub fn set_content_radius(app: AppHandle, radii: [Px; 4]) -> Result<(), AppError> {
  let radii = radii.map(|r| r.0);
  if !radii.iter().all(|r| r.is_finite() && *r >= 0.0) {
    return Err(AppError::invalid_input("radii must be finite, non-negative numbers"));
  }
  {
    let shape: State<Mutex<ContentShape>> = app.state();
    shape.lock().unwrap().radii = radii;
  }
  reapply_shape(&app);
  Ok(())
}

/// Cuts a window-relative rounded rect (logical px) out of the content webview under `id`, or clears
/// that id's hole with `rect: None`. The page keeps its bounds (no reflow); the UI shows through.
#[tauri::command]
#[specta::specta]
pub fn set_content_cutout(app: AppHandle, id: String, rect: Option<[Px; 4]>, radius: Px) -> Result<(), AppError> {
  let (rect, radius) = (rect.map(|r| r.map(|v| v.0)), radius.0);
  if let Some(r) = rect {
    if !r.iter().all(|v| v.is_finite()) {
      return Err(AppError::invalid_input("cutout must be finite numbers"));
    }
  }
  if !radius.is_finite() || radius < 0.0 {
    return Err(AppError::invalid_input("radius must be a finite, non-negative number"));
  }
  {
    let shape: State<Mutex<ContentShape>> = app.state();
    let mut shape = shape.lock().unwrap();
    match rect.filter(|r| r[2] > 0.0 && r[3] > 0.0) {
      Some(rect) => shape.cutouts.insert(id, Cutout { rect, radius }),
      None => shape.cutouts.remove(&id),
    };
  }
  reapply_shape(&app);
  Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_content_visible(app: AppHandle, visible: bool) -> Result<(), AppError> {
  {
    let shape: State<Mutex<ContentShape>> = app.state();
    shape.lock().unwrap().visible = visible;
  }
  let Some(webview) = browser::shown_webview(&app) else { return Ok(()) };
  Ok(if visible { webview.show() } else { webview.hide() }?)
}

/// Rebuilds the shown webview's clip, e.g. after a DPI change (logical bounds stay the same, so the
/// frontend won't re-report them).
pub fn reapply_shape(app: &AppHandle) {
  if let Some(webview) = browser::shown_webview(app) {
    apply_shape(&webview);
  }
}

/// Clips the content webview to its rounded shape, minus the cutouts. CSS can't do this: the webview is a native window above the UI.
fn apply_shape(webview: &Webview) {
  #[cfg(windows)]
  {
    let Ok(scale) = webview.window().scale_factor() else { return };
    let (x, y, width, height, radii, cutouts) = {
      let shape: State<Mutex<ContentShape>> = webview.state();
      let s = shape.lock().unwrap();
      (s.x, s.y, s.width, s.height, s.radii, s.cutouts.values().copied().collect::<Vec<_>>())
    };
    let w = (width * scale).round() as i32;
    let h = (height * scale).round() as i32;
    let max = w.min(h) / 2;
    let radii = radii.map(|r| ((r * scale).round() as i32).clamp(0, max));
    // The cutouts in the webview's own physical px: [left, top, right, bottom, radius].
    let cutouts: Vec<[i32; 5]> = cutouts
      .iter()
      .map(|c| {
        let [cx, cy, cw, ch] = c.rect;
        let left = ((cx - x) * scale).round() as i32;
        let top = ((cy - y) * scale).round() as i32;
        let right = left + (cw * scale).round() as i32;
        let bottom = top + (ch * scale).round() as i32;
        [left, top, right, bottom, (c.radius * scale).round() as i32]
      })
      // Holes that miss the page change nothing.
      .filter(|[l, t, r, b, _]| *r > 0 && *b > 0 && *l < w && *t < h)
      .collect();

    let _ = webview.with_webview(move |pw| {
      use windows::Win32::{
        Foundation::HWND,
        Graphics::Gdi::{
          CombineRgn, CreateEllipticRgn, CreateRectRgn, CreateRoundRectRgn, DeleteObject, SetWindowRgn, RGN_DIFF,
          RGN_OR,
        },
      };
      // SAFETY: called on the main thread with a live WebView2 controller. wry hosts each child
      // webview in its own container HWND (the controller's parent window); clipping it clips the page.
      unsafe {
        let mut hwnd = HWND::default();
        if pw.controller().ParentWindow(&mut hwnd).is_err() {
          return;
        }
        if radii.iter().all(|r| *r == 0) && cutouts.is_empty() {
          SetWindowRgn(hwnd, None, true);
          return;
        }
        // Full rect, minus an r×r square at each rounded corner, plus a quarter ellipse back in each square.
        let region = CreateRectRgn(0, 0, w, h);
        let [tl, tr, br, bl] = radii;
        let corners = [
          (tl, 0, 0),
          (tr, w - tr, 0),
          (br, w - br, h - br),
          (bl, 0, h - bl),
        ];
        for (r, x, y) in corners {
          if r == 0 {
            continue;
          }
          let square = CreateRectRgn(x, y, x + r, y + r);
          CombineRgn(Some(region), Some(region), Some(square), RGN_DIFF);
          let _ = DeleteObject(square.into());
          // The ellipse's box is the 2r×2r square anchored in this corner.
          let ex = if x == 0 { 0 } else { w - 2 * r };
          let ey = if y == 0 { 0 } else { h - 2 * r };
          let ellipse = CreateEllipticRgn(ex, ey, ex + 2 * r + 1, ey + 2 * r + 1);
          CombineRgn(Some(region), Some(region), Some(ellipse), RGN_OR);
          let _ = DeleteObject(ellipse.into());
        }
        for [left, top, right, bottom, radius] in cutouts {
          let hole = if radius > 0 {
            // The last two args are the corner ellipse's width and height.
            CreateRoundRectRgn(left, top, right + 1, bottom + 1, radius * 2, radius * 2)
          } else {
            CreateRectRgn(left, top, right, bottom)
          };
          CombineRgn(Some(region), Some(region), Some(hole), RGN_DIFF);
          let _ = DeleteObject(hole.into());
        }
        // The system owns the region from here on.
        SetWindowRgn(hwnd, Some(region), true);
      }
    });
  }

  // TODO: clip on macOS (layer cornerRadius) and Linux (WebKitGTK).
  #[cfg(not(windows))]
  let _ = webview;
}
