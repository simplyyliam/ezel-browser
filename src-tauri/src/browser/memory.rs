//! The load meter's numbers: how much memory Ezel uses in all, and how much of it each loaded tab
//! accounts for. Pure attribution here (tested); the runtime gathers the processes (WebView2's
//! process list, each process's private bytes) and each tab's main-frame id.
//!
//! Honest by construction: a page's renderer may serve several tabs (same site) or a tab may span
//! several renderers (cross-site iframes). A process shared by tabs is split evenly between them and
//! the share marked approximate; processes that serve no tab (Ezel itself, its UI, WebView2's
//! browser, GPU and utility processes) are reported as shared, never spread over the tabs.

use serde::Serialize;
use specta::Type;

use super::model::{Id, TsId};

/// One process: its memory (private bytes) and the main frames of the pages it renders, as the
/// ids of each frame's top-level frame (`ICoreWebView2_20::FrameId` of the webview that owns it).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Process {
  pub bytes: u64,
  pub roots: Vec<u32>,
}

/// What `get_memory` returns. MB, so the UI never deals in bytes.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MemoryReport {
  /// Everything Ezel runs: its own process, WebView2's processes and every page. Always approximate:
  /// processes share memory the counters can't split.
  pub total_mb: f64,
  /// The part no single tab accounts for (Ezel, its UI, WebView2's browser/GPU/utility processes).
  pub shared_mb: f64,
  /// Loaded tabs only, largest first. Unloaded tabs use nothing (the UI shows them as resting).
  pub tabs: Vec<TabMemory>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TabMemory {
  #[specta(type = TsId)]
  pub id: Id,
  pub mb: f64,
  /// Part of its memory is a process it shares with other tabs (split evenly): a rough share.
  pub approximate: bool,
}

const MB: f64 = 1024.0 * 1024.0;

/// Splits the processes' memory over the tabs whose main frames they render. `tabs`: each loaded
/// tab with its main-frame id (`None` before its first navigation: it gets nothing yet).
pub fn attribute(processes: &[Process], tabs: &[(Id, Option<u32>)]) -> MemoryReport {
  let mut per_tab: Vec<(Id, f64, bool)> = tabs.iter().map(|(id, _)| (*id, 0.0, false)).collect();
  let mut shared = 0.0;
  let mut total = 0.0;
  for process in processes {
    let mb = process.bytes as f64 / MB;
    total += mb;
    let owners: Vec<usize> = tabs
      .iter()
      .enumerate()
      .filter(|(_, (_, frame))| frame.is_some_and(|f| process.roots.contains(&f)))
      .map(|(i, _)| i)
      .collect();
    if owners.is_empty() {
      shared += mb;
      continue;
    }
    let share = mb / owners.len() as f64;
    for i in &owners {
      per_tab[*i].1 += share;
      per_tab[*i].2 |= owners.len() > 1;
    }
  }
  let mut tabs: Vec<TabMemory> = per_tab
    .into_iter()
    .map(|(id, mb, approximate)| TabMemory { id, mb, approximate })
    .collect();
  tabs.sort_by(|a, b| b.mb.total_cmp(&a.mb));
  MemoryReport { total_mb: total, shared_mb: shared, tabs }
}

/// A process's private bytes (what it alone commits), or `None` if it's gone or not ours to read.
#[cfg(windows)]
pub fn process_bytes(pid: u32) -> Option<u64> {
  use windows::Win32::{
    Foundation::CloseHandle,
    System::{
      ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX},
      Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
    },
  };
  // Why unsafe: std has no way to read another process's memory counters; this is the Win32 call
  // (psapi) that Task Manager's numbers come from, on WebView2's own processes.
  // SAFETY: the handle is closed before returning; the counters struct is sized by `cb`.
  unsafe {
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    let mut counters = PROCESS_MEMORY_COUNTERS_EX { cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32, ..Default::default() };
    let result = GetProcessMemoryInfo(handle, &mut counters as *mut _ as *mut PROCESS_MEMORY_COUNTERS, counters.cb);
    let _ = CloseHandle(handle);
    result.ok().map(|_| counters.PrivateUsage as u64)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const M: u64 = 1024 * 1024;

  #[test]
  fn each_renderer_goes_to_its_tab_and_the_rest_is_shared() {
    let processes = [
      Process { bytes: 100 * M, roots: vec![] },   // browser process
      Process { bytes: 50 * M, roots: vec![7] },   // tab 1's page
      Process { bytes: 30 * M, roots: vec![7] },   // a cross-site iframe in tab 1
      Process { bytes: 80 * M, roots: vec![9] },   // tab 2's page
      Process { bytes: 20 * M, roots: vec![42] },  // the UI webview (not a tab)
    ];
    let report = attribute(&processes, &[(1, Some(7)), (2, Some(9))]);
    assert_eq!(report.total_mb, 280.0);
    assert_eq!(report.shared_mb, 120.0);
    assert_eq!(
      report.tabs,
      vec![TabMemory { id: 1, mb: 80.0, approximate: false }, TabMemory { id: 2, mb: 80.0, approximate: false }]
    );
  }

  #[test]
  fn a_renderer_serving_several_tabs_is_split_and_marked_approximate() {
    let processes = [Process { bytes: 90 * M, roots: vec![1, 2] }, Process { bytes: 30 * M, roots: vec![3] }];
    let report = attribute(&processes, &[(10, Some(1)), (20, Some(2)), (30, Some(3))]);
    assert_eq!(report.tabs[0], TabMemory { id: 10, mb: 45.0, approximate: true });
    assert_eq!(report.tabs[1], TabMemory { id: 20, mb: 45.0, approximate: true });
    assert_eq!(report.tabs[2], TabMemory { id: 30, mb: 30.0, approximate: false });
    assert_eq!(report.shared_mb, 0.0);
  }

  #[test]
  fn a_tab_without_a_frame_yet_gets_nothing_and_tabs_sort_largest_first() {
    let processes = [Process { bytes: 10 * M, roots: vec![5] }, Process { bytes: 40 * M, roots: vec![6] }];
    let report = attribute(&processes, &[(1, Some(5)), (2, None), (3, Some(6))]);
    let order: Vec<Id> = report.tabs.iter().map(|t| t.id).collect();
    assert_eq!(order, vec![3, 1, 2]);
    assert_eq!(report.tabs[2].mb, 0.0);
  }

  #[test]
  fn report_serializes_in_camel_case() {
    let report = attribute(&[Process { bytes: M, roots: vec![1] }], &[(4, Some(1))]);
    let json = serde_json::to_value(&report).unwrap();
    assert_eq!(json, serde_json::json!({ "totalMb": 1.0, "sharedMb": 0.0, "tabs": [{ "id": 4, "mb": 1.0, "approximate": false }] }));
  }

  #[cfg(windows)]
  #[test]
  fn reads_this_process_memory() {
    assert!(process_bytes(std::process::id()).is_some_and(|b| b > 0));
  }
}
