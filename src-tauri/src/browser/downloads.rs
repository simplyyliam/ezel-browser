//! Ezel's downloads list (it replaces WebView2's flyout). Pure: the records and their rules; the
//! runtime feeds it WebView2's download events and keeps the COM objects (`webview2.rs`).
//!
//! The list lives in memory for the session only: nothing about downloads is written to disk by
//! Ezel (the files themselves go where WebView2 saves them, the Windows Downloads folder unless
//! "Save As" picked another). Paths and addresses are never logged and never sent to the UI: it
//! gets file names; Rust opens and reveals files by id.

use std::path::{Path, PathBuf};

use serde::Serialize;
use specta::Type;
use tauri_specta::Event;

/// Most downloads kept in the list; the oldest finished ones go first.
pub const MAX_DOWNLOADS: usize = 50;
/// Progress reaches the UI at most this often per download (WebView2 reports every chunk).
pub const PROGRESS_EVERY_MS: u64 = 250;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum DownloadState {
  InProgress,
  Completed,
  /// Cancelled by the user (in Ezel, or the site's own Save dialog cancelled).
  Cancelled,
  /// Interrupted: network, disk, a blocked file (SmartScreen), Ezel closing.
  Failed,
}

/// A download as the UI shows it.
#[derive(Clone, Debug, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Download {
  pub id: u32,
  pub file_name: String,
  pub state: DownloadState,
  #[specta(type = specta_typescript::Number)]
  pub received_bytes: f64,
  /// `null` while the size isn't known.
  #[specta(type = Option<specta_typescript::Number>)]
  pub total_bytes: Option<f64>,
}

/// Payload of "downloads-changed" and `get_downloads`: newest first.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "downloads-changed")]
pub struct DownloadsState {
  pub downloads: Vec<Download>,
}

#[derive(Clone, Debug)]
struct Record {
  id: u32,
  path: PathBuf,
  state: DownloadState,
  received: u64,
  total: Option<u64>,
  /// When progress last reached the UI (ms).
  shown_at: u64,
}

#[derive(Default)]
pub struct Downloads {
  next_id: u32,
  /// Oldest first.
  records: Vec<Record>,
}

/// The name shown for a path: its file name, or the whole path if it has none.
fn file_name(path: &Path) -> String {
  path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string_lossy().into_owned())
}

impl Downloads {
  /// A new download. `total`: its size if the server said (WebView2 reports -1 otherwise).
  pub fn start(&mut self, path: PathBuf, total: Option<u64>, now: u64) -> u32 {
    self.next_id += 1;
    let id = self.next_id;
    self.records.push(Record { id, path, state: DownloadState::InProgress, received: 0, total, shown_at: now });
    // Past the limit: the oldest finished ones go (never one still running).
    while self.records.len() > MAX_DOWNLOADS {
      match self.records.iter().position(|r| r.state != DownloadState::InProgress) {
        Some(i) => {
          self.records.remove(i);
        }
        None => break,
      }
    }
    id
  }

  /// Bytes arrived. Returns whether the UI should hear about it now (throttled).
  pub fn progress(&mut self, id: u32, received: u64, total: Option<u64>, now: u64) -> bool {
    let Some(record) = self.records.iter_mut().find(|r| r.id == id) else { return false };
    if record.state != DownloadState::InProgress {
      return false;
    }
    record.received = received;
    if total.is_some() {
      record.total = total;
    }
    if now.saturating_sub(record.shown_at) < PROGRESS_EVERY_MS {
      return false;
    }
    record.shown_at = now;
    true
  }

  /// It ended (or WebView2 knows the final path now). Returns false for an unknown id.
  pub fn finish(&mut self, id: u32, state: DownloadState, path: Option<PathBuf>) -> bool {
    let Some(record) = self.records.iter_mut().find(|r| r.id == id) else { return false };
    record.state = state;
    if let Some(path) = path {
      record.path = path;
    }
    if state == DownloadState::Completed {
      if let Some(total) = record.total {
        record.received = total;
      }
    }
    true
  }

  pub fn state(&self, id: u32) -> Option<DownloadState> {
    self.records.iter().find(|r| r.id == id).map(|r| r.state)
  }

  /// A finished download's file, to open or show (`None` while running, or for an unknown id).
  pub fn completed_path(&self, id: u32) -> Option<&Path> {
    self.records.iter().find(|r| r.id == id && r.state == DownloadState::Completed).map(|r| r.path.as_path())
  }

  /// Any download's path (to show its folder, even if it failed).
  pub fn path(&self, id: u32) -> Option<&Path> {
    self.records.iter().find(|r| r.id == id).map(|r| r.path.as_path())
  }

  /// "Clear": forgets every finished download (the files stay).
  pub fn clear_finished(&mut self) {
    self.records.retain(|r| r.state == DownloadState::InProgress);
  }

  pub fn view(&self) -> DownloadsState {
    DownloadsState {
      downloads: self
        .records
        .iter()
        .rev()
        .map(|r| Download {
          id: r.id,
          file_name: file_name(&r.path),
          state: r.state,
          received_bytes: r.received as f64,
          total_bytes: r.total.map(|t| t as f64),
        })
        .collect(),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_download_runs_then_completes_newest_first() {
    let mut d = Downloads::default();
    let a = d.start(PathBuf::from(r"C:\Users\x\Downloads\a.zip"), Some(100), 0);
    let b = d.start(PathBuf::from(r"C:\Users\x\Downloads\b.png"), None, 0);
    assert_eq!(d.view().downloads.iter().map(|x| x.id).collect::<Vec<_>>(), vec![b, a]);
    assert_eq!(d.view().downloads[1].file_name, "a.zip");
    assert!(d.finish(a, DownloadState::Completed, None));
    let a_view = &d.view().downloads[1];
    assert_eq!((a_view.state, a_view.received_bytes), (DownloadState::Completed, 100.0));
    assert!(d.completed_path(a).is_some());
    assert!(d.completed_path(b).is_none(), "still running: nothing to open");
  }

  #[test]
  fn progress_is_throttled_and_stops_after_the_end() {
    let mut d = Downloads::default();
    let id = d.start(PathBuf::from("f.bin"), None, 0);
    assert!(!d.progress(id, 10, None, 100), "too soon");
    assert!(d.progress(id, 20, Some(50), 300));
    assert_eq!(d.view().downloads[0].total_bytes, Some(50.0));
    assert!(!d.progress(id, 30, None, 400));
    assert_eq!(d.view().downloads[0].received_bytes, 30.0, "recorded even when not shown");
    d.finish(id, DownloadState::Cancelled, None);
    assert!(!d.progress(id, 40, None, 10_000));
    assert!(!d.progress(999, 1, None, 10_000), "unknown id");
    assert!(!d.finish(999, DownloadState::Failed, None));
  }

  #[test]
  fn clearing_keeps_running_downloads_and_the_list_is_capped() {
    let mut d = Downloads::default();
    let running = d.start(PathBuf::from("running"), None, 0);
    for i in 0..MAX_DOWNLOADS + 5 {
      let id = d.start(PathBuf::from(format!("{i}")), None, 0);
      d.finish(id, DownloadState::Completed, None);
    }
    assert_eq!(d.view().downloads.len(), MAX_DOWNLOADS);
    assert_eq!(d.state(running), Some(DownloadState::InProgress), "never dropped while running");
    d.clear_finished();
    assert_eq!(d.view().downloads.iter().map(|x| x.id).collect::<Vec<_>>(), vec![running]);
  }

  #[test]
  fn the_final_path_replaces_the_first() {
    let mut d = Downloads::default();
    let id = d.start(PathBuf::from("download.tmp"), None, 0);
    d.finish(id, DownloadState::Completed, Some(PathBuf::from(r"D:\Saved\report.pdf")));
    assert_eq!(d.view().downloads[0].file_name, "report.pdf");
    assert_eq!(d.path(id), Some(Path::new(r"D:\Saved\report.pdf")));
  }
}
