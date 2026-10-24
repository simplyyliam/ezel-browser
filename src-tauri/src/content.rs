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

/// Where the website goes now (logical px): new tab webviews are created there, so their first
/// frame is drawn at the right size (one created at 0x0 and resized on show drew part white, part black).
pub fn current_bounds(app: &AppHandle) -> Rect {
  let shape: State<Mutex<ContentShape>> = app.state();
  let shape = shape.lock().unwrap();
  bounds(&shape)
}

/// Sets the bounds the frontend is about to report, if it hasn't reported any yet (at launch).
pub fn assume_bounds(app: &AppHandle, x: f64, y: f64, width: f64, height: f64) {
  let shape: State<Mutex<ContentShape>> = app.state();
  let mut shape = shape.lock().unwrap();
  if shape.width == 0.0 && shape.height == 0.0 {
    (shape.x, shape.y, shape.width, shape.height) = (x, y, width.max(0.0), height.max(0.0));
  }
}

/// Places a tab's webview where the website goes and shows it (if the website is visible and,
/// for a new webview, its page has started rendering: `painted`). Called when a tab becomes the
/// shown one, and when a new one's page starts.
pub fn present(webview: &Webview, painted: bool) {
  let (rect, visible) = {
    let shape: State<Mutex<ContentShape>> = webview.state();
    let s = shape.lock().unwrap();
    (bounds(&s), s.visible)
  };
  let _ = webview.set_bounds(rect);
  apply_shape(webview);
  let _ = if visible && painted { webview.show() } else { webview.hide() };
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
  // A new tab's webview waits for its page (browser::reveal shows it then).
  Ok(if visible && browser::shown_painted(&app) { webview.show() } else { webview.hide() }?)
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
    let radii = radii.map(|r| r * scale);
    // The cutouts in the webview's own physical px: ([left, top, right, bottom], radius).
    let cutouts: Vec<([i32; 4], f64)> = cutouts
      .iter()
      .map(|c| {
        let [cx, cy, cw, ch] = c.rect;
        let left = ((cx - x) * scale).round() as i32;
        let top = ((cy - y) * scale).round() as i32;
        let right = left + (cw * scale).round() as i32;
        let bottom = top + (ch * scale).round() as i32;
        ([left, top, right, bottom], c.radius * scale)
      })
      // Holes that miss the page change nothing.
      .filter(|([l, t, r, b], _)| *r > 0 && *b > 0 && *l < w && *t < h)
      .collect();
    // A hole across the page's whole top (the titlebar peek) doesn't leave a flat cut: the page
    // starts below it instead, with its own top corners, so it reads as a card under the bar.
    let (top, cutouts) = page_top(w, cutouts);

    let _ = webview.with_webview(move |pw| {
      use windows::Win32::{
        Foundation::HWND,
        Graphics::Gdi::{CombineRgn, DeleteObject, SetWindowRgn, RGN_DIFF},
      };
      // SAFETY: called on the main thread with a live WebView2 controller. wry hosts each child
      // webview in its own container HWND (the controller's parent window); clipping it clips the page.
      unsafe {
        let mut hwnd = HWND::default();
        if pw.controller().ParentWindow(&mut hwnd).is_err() {
          return;
        }
        if radii.iter().all(|r| *r < 0.5) && cutouts.is_empty() && top == 0 {
          SetWindowRgn(hwnd, None, true);
          return;
        }
        let Some(region) = region_from_bands(&rounded_rect_bands([0, top, w, h], radii)) else { return };
        for (rect, radius) in cutouts {
          if let Some(hole) = region_from_bands(&rounded_rect_bands(rect, [radius; 4])) {
            CombineRgn(Some(region), Some(region), Some(hole), RGN_DIFF);
            let _ = DeleteObject(hole.into());
          }
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

/// Splits off the holes that span the page's whole width from its top edge: the page starts below
/// the lowest of them (returned first) and the rest stay holes.
fn page_top(w: i32, cutouts: Vec<([i32; 4], f64)>) -> (i32, Vec<([i32; 4], f64)>) {
  let (across, rest): (Vec<_>, Vec<_>) = cutouts.into_iter().partition(|([l, t, r, _], _)| *l <= 0 && *t <= 0 && *r >= w);
  (across.iter().map(|([_, _, _, b], _)| *b).max().unwrap_or(0).max(0), rest)
}

/// A rounded rectangle as horizontal bands of whole pixels ([left, top, right, bottom], physical
/// px, top to bottom), for a window region. A pixel is in when its centre is inside the shape, the
/// closest a region (no partial pixels, so no anti-aliasing) gets to what CSS draws. GDI's own
/// `CreateRoundRectRgn` and `CreateEllipticRgn` are lopsided and a pixel off, which made every
/// rounded corner and pill edge Ezel cuts look rougher than it had to. Radii are in CSS order
/// (top-left, top-right, bottom-right, bottom-left), fractional, each at most half the shorter
/// side (as CSS does).
#[cfg_attr(not(windows), allow(dead_code))]
fn rounded_rect_bands([left, top, right, bottom]: [i32; 4], radii: [f64; 4]) -> Vec<[i32; 4]> {
  let (w, h) = (right - left, bottom - top);
  if w <= 0 || h <= 0 {
    return Vec::new();
  }
  let max = f64::from(w.min(h)) / 2.0;
  let [tl, tr, br, bl] = radii.map(|r| r.clamp(0.0, max));
  // How many pixels a corner of radius `r` takes off row `i`, counted from that corner's edge.
  let inset = |r: f64, i: i32| -> i32 {
    let dy = r - (f64::from(i) + 0.5);
    if dy <= 0.0 {
      return 0;
    }
    ((r - (r * r - dy * dy).sqrt()) - 0.5).ceil().max(0.0) as i32
  };
  let mut bands: Vec<[i32; 4]> = Vec::new();
  for row in 0..h {
    let from_bottom = h - 1 - row;
    let l = inset(tl, row).max(inset(bl, from_bottom));
    let r = inset(tr, row).max(inset(br, from_bottom));
    if l + r >= w {
      continue;
    }
    let (x0, x1, y) = (left + l, right - r, top + row);
    match bands.last_mut() {
      // Same span as the row above: grow that band.
      Some(last) if last[0] == x0 && last[2] == x1 && last[3] == y => last[3] = y + 1,
      _ => bands.push([x0, y, x1, y + 1]),
    }
  }
  bands
}

/// A GDI region made of `bands` (from `rounded_rect_bands`), in one call. The caller owns it.
#[cfg(windows)]
unsafe fn region_from_bands(bands: &[[i32; 4]]) -> Option<windows::Win32::Graphics::Gdi::HRGN> {
  use windows::Win32::Graphics::Gdi::{ExtCreateRegion, RDH_RECTANGLES, RGNDATA, RGNDATAHEADER};
  if bands.is_empty() {
    return None;
  }
  let header = std::mem::size_of::<RGNDATAHEADER>();
  // RGNDATA is a header then its RECTs (4 i32s each); i32 storage keeps it aligned.
  let mut data = vec![0i32; header / 4 + bands.len() * 4];
  let bound = bands.iter().fold([i32::MAX, i32::MAX, i32::MIN, i32::MIN], |b, r| {
    [b[0].min(r[0]), b[1].min(r[1]), b[2].max(r[2]), b[3].max(r[3])]
  });
  data[..8].copy_from_slice(&[
    header as i32,
    RDH_RECTANGLES as i32,
    bands.len() as i32,
    (bands.len() * 16) as i32,
    bound[0],
    bound[1],
    bound[2],
    bound[3],
  ]);
  for (i, band) in bands.iter().enumerate() {
    let at = header / 4 + i * 4;
    data[at..at + 4].copy_from_slice(band);
  }
  // SAFETY: `data` is a complete RGNDATA (header, then `nCount` RECTs) that outlives the call.
  let hrgn = unsafe { ExtCreateRegion(None, (data.len() * 4) as u32, data.as_ptr().cast::<RGNDATA>()) };
  (!hrgn.is_invalid()).then_some(hrgn)
}

#[cfg(test)]
mod tests {
  use super::{page_top, rounded_rect_bands};

  #[test]
  fn a_hole_across_the_top_moves_the_page_down() {
    let (top, rest) = page_top(100, vec![([-1, -1, 101, 30], 0.0), ([10, 50, 30, 60], 4.0)]);
    assert_eq!(top, 30);
    assert_eq!(rest.len(), 1);
    // A hole that doesn't span the width stays a hole.
    let (top, rest) = page_top(100, vec![([0, 0, 60, 30], 0.0)]);
    assert_eq!((top, rest.len()), (0, 1));
  }

  #[test]
  fn square_corners_are_one_band() {
    assert_eq!(rounded_rect_bands([2, 3, 12, 8], [0.0; 4]), vec![[2, 3, 12, 8]]);
  }

  #[test]
  fn rounded_corners_are_symmetric() {
    let bands = rounded_rect_bands([0, 0, 40, 40], [8.0; 4]);
    let rows: Vec<(i32, i32)> =
      (0..40).map(|y| bands.iter().find(|b| b[1] <= y && y < b[3]).map(|b| (b[0], b[2])).unwrap()).collect();
    for y in 0..40 {
      let (l, r) = rows[y as usize];
      // Left/right and top/bottom mirror each other.
      assert_eq!(l, 40 - r, "row {y}");
      assert_eq!(rows[y as usize], rows[(39 - y) as usize], "row {y}");
    }
    // The corner bites in at the top and is gone by the radius.
    assert!(rows[0].0 >= 2);
    assert_eq!(rows[8], (0, 40));
    // Bands are sorted and don't overlap (what ExtCreateRegion expects).
    assert!(bands.windows(2).all(|p| p[0][3] <= p[1][1]));
  }

  #[test]
  fn a_pill_is_round_at_both_ends() {
    // 20px high with a huge radius: clamped to 10, so the ends are half circles.
    let bands = rounded_rect_bands([0, 0, 100, 20], [999.0; 4]);
    let first = bands.first().unwrap();
    let middle = bands.iter().find(|b| b[1] <= 10 && 10 < b[3]).unwrap();
    assert!(first[0] > 5 && first[2] < 95);
    assert_eq!((middle[0], middle[2]), (0, 100));
  }

  #[test]
  fn empty_rects_have_no_bands() {
    assert!(rounded_rect_bands([5, 5, 5, 20], [4.0; 4]).is_empty());
  }
}
