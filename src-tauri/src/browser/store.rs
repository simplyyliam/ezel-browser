//! Saves the session to `<app data>/ezel/session.json`, like Zen's `zen-sessions.jsonlz4`: one file,
//! written off the main thread, debounced, atomically (temp file + rename) and with a backup of the
//! previous good file to fall back on.

use std::{
  fs,
  path::{Path, PathBuf},
  sync::mpsc::{self, Receiver, RecvTimeoutError, Sender},
  thread,
  time::Duration,
};

use super::model::Session;

const FILE_NAME: &str = "session.json";
const BACKUP_NAME: &str = "session.json.bak";
const TEMP_NAME: &str = "session.json.tmp";

/// Changes in a burst (dragging, a page loading) are written once, this long after the last one.
const DEBOUNCE: Duration = Duration::from_millis(1000);

enum Message {
  Save(String),
  /// Writes anything pending now, then acknowledges.
  Flush(Sender<()>),
}

/// Handle to the writer thread.
pub struct Store {
  tx: Sender<Message>,
}

impl Store {
  /// Starts the writer thread for `dir` (created if missing).
  pub fn new(dir: PathBuf) -> Self {
    let (tx, rx) = mpsc::channel();
    thread::Builder::new()
      .name("session-store".into())
      .spawn(move || run(&dir, rx))
      .expect("failed to start the session store thread");
    Store { tx }
  }

  /// Queues a save. Serialised by the caller (a few KB) so the thread never touches the model.
  pub fn save(&self, session: &Session) {
    match serde_json::to_string(session) {
      Ok(json) => {
        let _ = self.tx.send(Message::Save(json));
      }
      Err(e) => log::error!("session: failed to serialise: {e}"),
    }
  }

  /// Blocks until pending changes are on disk (at exit). Gives up after a second.
  pub fn flush(&self) {
    let (ack_tx, ack_rx) = mpsc::channel();
    if self.tx.send(Message::Flush(ack_tx)).is_ok() {
      let _ = ack_rx.recv_timeout(Duration::from_secs(1));
    }
  }
}

/// Reads the saved session, falling back to the backup. `None` = first run or both unreadable.
/// An unreadable file is moved aside (`*.unreadable`), never overwritten: saving rotates the
/// current file into the backup, which would otherwise destroy data we don't understand.
pub fn load(dir: &Path) -> Option<Session> {
  [FILE_NAME, BACKUP_NAME].iter().find_map(|name| {
    let path = dir.join(name);
    let text = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&text)
      .map_err(|e| {
        let aside = dir.join(format!("{name}.unreadable"));
        log::warn!("session: {} is unreadable ({e}); moved to {}", path.display(), aside.display());
        let _ = fs::rename(&path, &aside);
      })
      .ok()
  })
}

fn run(dir: &Path, rx: Receiver<Message>) {
  let mut pending: Option<String> = None;
  let write_pending = |pending: &mut Option<String>| {
    if let Some(json) = pending.take() {
      write(dir, &json);
    }
  };
  loop {
    let message = match pending {
      Some(_) => rx.recv_timeout(DEBOUNCE),
      None => rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
    };
    match message {
      Ok(Message::Save(json)) => pending = Some(json),
      Ok(Message::Flush(ack)) => {
        write_pending(&mut pending);
        let _ = ack.send(());
      }
      Err(RecvTimeoutError::Timeout) => write_pending(&mut pending),
      Err(RecvTimeoutError::Disconnected) => return write_pending(&mut pending),
    }
  }
}

/// Temp file first, then the current file becomes the backup and the temp file replaces it, so a
/// crash at any point leaves either the new file or the backup readable.
fn write(dir: &Path, json: &str) {
  let result = (|| -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let (file, backup, temp) = (dir.join(FILE_NAME), dir.join(BACKUP_NAME), dir.join(TEMP_NAME));
    fs::write(&temp, json)?;
    if file.exists() {
      fs::rename(&file, &backup)?;
    }
    fs::rename(&temp, &file)
  })();
  if let Err(e) = result {
    log::error!("session: failed to save to {}: {e}", dir.display());
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn saves_debounced_and_loads_back_with_backup_fallback() {
    // Inside the crate's target dir, never the system temp folder: tests write only in the repo.
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/test-tmp").join(format!("ezel-store-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    let store = Store::new(dir.clone());
    let mut session = Session::new("https://a.test/", 0);
    store.save(&session);
    session.next_id = 42;
    store.save(&session);
    store.flush();
    assert_eq!(load(&dir).unwrap().next_id, 42, "only the latest save is written");

    session.next_id = 43;
    store.save(&session);
    store.flush();
    fs::write(dir.join(FILE_NAME), "{ corrupt").unwrap();
    assert_eq!(load(&dir).unwrap().next_id, 42, "falls back to the previous file");
    assert_eq!(fs::read_to_string(dir.join("session.json.unreadable")).unwrap(), "{ corrupt", "kept, not overwritten");
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn closed_tabs_survive_a_save_and_load() {
    use crate::browser::model::{ClosedTab, TabLocation};
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/test-tmp").join(format!("ezel-closed-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    let store = Store::new(dir.clone());
    let mut session = Session::new("https://a.test/", 0);
    let closed = ClosedTab {
      url: "https://gone.test/".into(),
      title: Some("Gone".into()),
      favicon: None,
      pinned_url: None,
      location: TabLocation::Temp { space_id: 1, index: Some(3) },
    };
    session.closed.push(closed.clone());
    store.save(&session);
    store.flush();
    assert_eq!(load(&dir).unwrap().closed, vec![closed]);
    let _ = fs::remove_dir_all(&dir);
  }
}
