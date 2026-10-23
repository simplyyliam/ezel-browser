//! Auto-updates through Tauri's updater plugin: installed Ezel asks GitHub for the latest release's
//! `latest.json` at launch and once a day, downloads a newer version quietly, verifies it against
//! Ezel's updater key (`plugins.updater.pubkey`; the private key lives only in GitHub Actions), then
//! tells the UI it's ready. Nothing installs or restarts until the user clicks the note.
//!
//! - One network call of our own: the check (github.com), plus the download when there's an update.
//! - No polling: one thread that sleeps a day between checks, and skips them while an update waits.
//! - Release builds only. A debug build checks nothing; `EZEL_UPDATE_MOCK=1` makes it pretend an
//!   update is ready (the note shows, a click just restarts), to test the UI without a release.
//! - Never logs URLs: errors are logged by kind only.

use std::{sync::Mutex, thread, time::Duration};

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

use crate::{emit_to_ui, error::AppError};

/// Between two checks. A check that fails (offline) waits as long: updates aren't urgent.
const CHECK_EVERY: Duration = Duration::from_secs(24 * 60 * 60);
/// The first check waits until launch is done (the restored tab loading comes first).
const FIRST_CHECK_AFTER: Duration = Duration::from_secs(20);

/// Where an update is. Only `Ready` is shown; the rest is quiet.
#[derive(Clone, Debug, Default, PartialEq)]
pub enum Phase {
  #[default]
  Idle,
  Checking,
  Downloading { version: String },
  Ready { version: String },
  Installing { version: String },
}

/// What happened, fed to [`Phase::next`]. Debug builds only use some of it (the mock).
#[cfg_attr(debug_assertions, allow(dead_code))]
#[derive(Clone, Debug, PartialEq)]
pub enum Step {
  Check,
  Found(String),
  NoUpdate,
  Failed,
  Downloaded,
  Install,
}

impl Phase {
  /// The rules, in one place: a check runs only from `Idle`, a download only after a check found
  /// something, `Ready` stays until installed, and any failure goes back to `Idle` (try again later).
  /// Anything else is ignored (the phase stays as it is).
  pub fn next(&self, step: Step) -> Phase {
    use Phase::*;
    match (self, step) {
      (Idle, Step::Check) => Checking,
      (Checking, Step::Found(version)) => Downloading { version },
      (Checking, Step::NoUpdate) => Idle,
      (Checking | Downloading { .. }, Step::Failed) => Idle,
      (Downloading { version }, Step::Downloaded) => Ready { version: version.clone() },
      (Ready { version }, Step::Install) => Installing { version: version.clone() },
      // The downloaded bytes went to the installer: the next daily check fetches them again.
      (Installing { .. }, Step::Failed) => Idle,
      (phase, _) => phase.clone(),
    }
  }

  /// The daily check is skipped while there's something to install.
  #[cfg_attr(debug_assertions, allow(dead_code))]
  pub fn wants_check(&self) -> bool {
    matches!(self, Phase::Idle)
  }

  pub fn status(&self) -> UpdateStatus {
    match self {
      Phase::Ready { version } | Phase::Installing { version } => UpdateStatus { ready_version: Some(version.clone()) },
      _ => UpdateStatus::default(),
    }
  }
}

/// Payload of "update-status" and `get_update_status`: the version downloaded and waiting for a
/// restart, or `null`.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "update-status")]
pub struct UpdateStatus {
  pub ready_version: Option<String>,
}

/// Managed state: the phase, and the verified installer bytes once downloaded.
#[derive(Default)]
pub struct Updates {
  phase: Mutex<Phase>,
  #[cfg(not(debug_assertions))]
  ready: Mutex<Option<(tauri_plugin_updater::Update, Vec<u8>)>>,
}

impl Updates {
  /// Applies a step; tells the UI when what it shows changes.
  fn step(&self, app: &AppHandle, step: Step) -> Phase {
    let (before, after) = {
      let mut phase = self.phase.lock().unwrap();
      let before = phase.status();
      *phase = phase.next(step);
      (before, phase.clone())
    };
    if after.status() != before {
      emit_to_ui(app, &after.status());
    }
    after
  }
}

/// Starts the checks (release builds), or the mock (debug builds with `EZEL_UPDATE_MOCK=1`).
pub fn start(app: &AppHandle) {
  // Measurement builds stay offline: a check would show up in the numbers.
  if cfg!(feature = "perf") {
    return;
  }
  let app = app.clone();
  #[cfg(debug_assertions)]
  if std::env::var("EZEL_UPDATE_MOCK").is_ok_and(|v| v == "1") {
    let _ = thread::Builder::new().name("update-mock".into()).spawn(move || {
      thread::sleep(Duration::from_secs(3));
      let updates: State<Updates> = app.state();
      for step in [Step::Check, Step::Found("9.9.9".into()), Step::Downloaded] {
        updates.step(&app, step);
      }
    });
    return;
  }
  #[cfg(not(debug_assertions))]
  let _ = thread::Builder::new().name("updater".into()).spawn(move || {
    thread::sleep(FIRST_CHECK_AFTER);
    loop {
      let updates: State<Updates> = app.state();
      let wants_check = updates.phase.lock().unwrap().wants_check();
      if wants_check {
        tauri::async_runtime::block_on(check_and_download(&app));
      }
      thread::sleep(CHECK_EVERY);
    }
  });
  #[cfg(debug_assertions)]
  let _ = (app, CHECK_EVERY, FIRST_CHECK_AFTER);
}

/// One check; a newer version is downloaded and verified (the plugin checks its signature).
#[cfg(not(debug_assertions))]
async fn check_and_download(app: &AppHandle) {
  use tauri_plugin_updater::UpdaterExt;
  let updates: State<Updates> = app.state();
  updates.step(app, Step::Check);
  let update = match app.updater().map(|u| async move { u.check().await }) {
    Ok(check) => check.await,
    Err(e) => Err(e),
  };
  let update = match update {
    Ok(Some(update)) => update,
    Ok(None) => {
      updates.step(app, Step::NoUpdate);
      return;
    }
    Err(e) => {
      log::warn!("update check failed: {}", error_kind(&e));
      updates.step(app, Step::Failed);
      return;
    }
  };
  updates.step(app, Step::Found(update.version.clone()));
  match update.download(|_, _| {}, || {}).await {
    Ok(bytes) => {
      *updates.ready.lock().unwrap() = Some((update, bytes));
      updates.step(app, Step::Downloaded);
    }
    Err(e) => {
      log::warn!("update download failed: {}", error_kind(&e));
      updates.step(app, Step::Failed);
    }
  }
}

/// The error's variant name only: the plugin's messages can carry the endpoint or download URL.
#[cfg(not(debug_assertions))]
fn error_kind(e: &tauri_plugin_updater::Error) -> String {
  format!("{e:?}").split(['(', ' ', '{']).next().unwrap_or("unknown").to_string()
}

#[tauri::command]
#[specta::specta]
pub fn get_update_status(updates: State<Updates>) -> Result<UpdateStatus, AppError> {
  Ok(updates.phase.lock().unwrap().status())
}

/// Installs the downloaded update and restarts Ezel (the note's button). On Windows the installer
/// takes over: the session is saved first, then Ezel exits and the installer starts it again.
#[tauri::command]
#[specta::specta]
pub async fn install_update(app: AppHandle) -> Result<(), AppError> {
  let updates: State<Updates> = app.state();
  if !matches!(updates.step(&app, Step::Install), Phase::Installing { .. }) {
    return Err(AppError::not_found("no update is ready"));
  }
  // The installer ends this process without a normal exit: save the session first.
  crate::browser::flush(&app);
  install(&app).await
}

/// The mock: nothing to install, so it only restarts.
#[cfg(debug_assertions)]
async fn install(app: &AppHandle) -> Result<(), AppError> {
  app.restart()
}

#[cfg(not(debug_assertions))]
async fn install(app: &AppHandle) -> Result<(), AppError> {
  let updates: State<Updates> = app.state();
  let failed = || {
    // Back to idle: the next daily check downloads it again.
    updates.step(app, Step::Failed);
    Err(AppError::internal("the update couldn't be installed"))
  };
  let Some((update, bytes)) = updates.ready.lock().unwrap().take() else { return failed() };
  match tauri::async_runtime::spawn_blocking(move || update.install(bytes)).await {
    // Windows exits inside `install` (the installer starts Ezel again); elsewhere restart now.
    Ok(Ok(())) => app.restart(),
    Ok(Err(e)) => {
      log::warn!("update install failed: {}", error_kind(&e));
      failed()
    }
    Err(_) => failed(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn run(steps: impl IntoIterator<Item = Step>) -> Phase {
    steps.into_iter().fold(Phase::Idle, |phase, step| phase.next(step))
  }

  #[test]
  fn a_found_update_downloads_then_waits_for_the_click() {
    let ready = run([Step::Check, Step::Found("0.4.0".into()), Step::Downloaded]);
    assert_eq!(ready, Phase::Ready { version: "0.4.0".into() });
    assert_eq!(ready.status().ready_version.as_deref(), Some("0.4.0"));
    assert!(!ready.wants_check(), "no more checks once one is ready");
    assert_eq!(ready.next(Step::Install), Phase::Installing { version: "0.4.0".into() });
  }

  #[test]
  fn nothing_new_or_a_failure_goes_quietly_back_to_idle() {
    assert_eq!(run([Step::Check, Step::NoUpdate]), Phase::Idle);
    assert_eq!(run([Step::Check, Step::Failed]), Phase::Idle, "offline");
    assert_eq!(run([Step::Check, Step::Found("0.4.0".into()), Step::Failed]), Phase::Idle, "bad download or signature");
    for phase in [Phase::Idle, Phase::Checking, Phase::Downloading { version: "1.0.0".into() }] {
      assert_eq!(phase.status(), UpdateStatus::default(), "only a ready update shows: {phase:?}");
    }
    assert!(Phase::Idle.wants_check());
  }

  #[test]
  fn steps_out_of_order_change_nothing() {
    // Install without a ready update, a download that was never found, a second check mid-check.
    assert_eq!(Phase::Idle.next(Step::Install), Phase::Idle);
    assert_eq!(Phase::Idle.next(Step::Downloaded), Phase::Idle);
    assert_eq!(Phase::Checking.next(Step::Check), Phase::Checking);
    let ready = Phase::Ready { version: "0.4.0".into() };
    assert_eq!(ready.next(Step::Check), ready, "a ready update isn't replaced by a new check");
    assert_eq!(ready.next(Step::Failed), ready);
  }

  #[test]
  fn a_failed_install_goes_back_to_checking_daily() {
    let installing = Phase::Installing { version: "0.4.0".into() };
    let after = installing.next(Step::Failed);
    assert_eq!(after, Phase::Idle);
    assert!(after.wants_check());
    assert_eq!(after.status(), UpdateStatus::default(), "the note goes away");
  }

  #[test]
  fn status_serializes_for_the_ui() {
    let status = UpdateStatus { ready_version: Some("0.4.0".into()) };
    assert_eq!(serde_json::to_value(status).unwrap(), serde_json::json!({ "readyVersion": "0.4.0" }));
  }
}
