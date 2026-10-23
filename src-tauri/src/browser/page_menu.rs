//! The website's right-click menu: Ezel draws its own (the UI, cut out of the page like every
//! popup), from what WebView2's `ContextMenuRequested` says was right-clicked. Which entries show,
//! in which groups, is decided here (pure, tested); the UI only labels them (the menu catalog).
//!
//! An entry either runs one of WebView2's own commands (copy, paste, save image, inspect: they act
//! on the exact element that was right-clicked, in its frame) or one of Ezel's (open a link as an
//! Ezel tab, search the selection). The UI names an entry; Rust checks it was offered and acts on
//! the request it kept, never on text from the UI.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

/// One entry of the page menu.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PageMenuAction {
  Back,
  Forward,
  Reload,
  OpenLinkInNewTab,
  CopyLink,
  OpenImageInNewTab,
  CopyImage,
  CopyImageAddress,
  SaveImage,
  Undo,
  Redo,
  Cut,
  Copy,
  Paste,
  PasteAsPlainText,
  SelectAll,
  SearchSelection,
  Inspect,
}

impl PageMenuAction {
  /// The WebView2 menu item (its `Name`) that runs it, for the ones WebView2 does itself.
  pub fn native_name(self) -> Option<&'static str> {
    Some(match self {
      Self::CopyImage => "copyImage",
      Self::CopyImageAddress => "copyImageLocation",
      Self::SaveImage => "saveImageAs",
      Self::Undo => "undo",
      Self::Redo => "redo",
      Self::Cut => "cut",
      Self::Copy => "copy",
      Self::Paste => "paste",
      Self::PasteAsPlainText => "pasteAndMatchStyle",
      Self::SelectAll => "selectAll",
      Self::Inspect => "inspectElement",
      _ => return None,
    })
  }
}

/// What was right-clicked (WebView2's context menu target).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct MenuTarget {
  pub is_image: bool,
  pub editable: bool,
  pub link: Option<String>,
  pub image: Option<String>,
  pub selection: Option<String>,
  pub can_go_back: bool,
  pub can_go_forward: bool,
}

/// An entry as the UI shows it.
#[derive(Clone, Debug, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PageMenuEntry {
  pub action: PageMenuAction,
  /// Always true in a built menu (what can't run is left out); kept for the contract.
  pub enabled: bool,
}

/// Payload of "page-menu": open Ezel's menu at this window point (logical px).
#[derive(Clone, Debug, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "page-menu")]
pub struct PageMenu {
  /// Which right-click this is: the choice names it, so a late answer for an older menu is ignored.
  pub id: u32,
  #[specta(type = specta_typescript::Number)]
  pub x: f64,
  #[specta(type = specta_typescript::Number)]
  pub y: f64,
  pub groups: Vec<Vec<PageMenuEntry>>,
  /// The selected text, shortened, for "Search for “…”". Shown as text only.
  pub selection: Option<String>,
}

/// Longest selection shown in "Search for “…”" (the search itself uses all of it, up to
/// [`MAX_SEARCH`]).
pub const SELECTION_PREVIEW: usize = 24;
/// Longest selection searched for (more is a paste, not a query).
pub const MAX_SEARCH: usize = 500;

/// "Search for “a long sel…”".
pub fn preview(selection: &str) -> String {
  let one_line: String = selection.split_whitespace().collect::<Vec<_>>().join(" ");
  if one_line.chars().count() <= SELECTION_PREVIEW {
    return one_line;
  }
  let cut: String = one_line.chars().take(SELECTION_PREVIEW - 1).collect();
  format!("{}…", cut.trim_end())
}

/// The menu for `target`. `native` lists WebView2's own items for this request (`Name`, enabled):
/// a native entry shows only when WebView2 offers it. Groups follow the catalog: the link, the
/// image, the text (editing, or a selection), the page (when nothing more specific was clicked),
/// then Inspect, always last.
pub fn groups(target: &MenuTarget, native: &[(String, bool)]) -> Vec<Vec<PageMenuEntry>> {
  let offered = |action: PageMenuAction| match action.native_name() {
    Some(name) => native.iter().find(|(n, _)| n == name).map(|(_, enabled)| PageMenuEntry { action, enabled: *enabled }),
    None => Some(PageMenuEntry { action, enabled: true }),
  };
  let pick = |actions: &[PageMenuAction]| actions.iter().filter_map(|a| offered(*a)).collect::<Vec<_>>();
  use PageMenuAction::*;
  let has_selection = target.selection.as_deref().is_some_and(|s| !s.trim().is_empty());
  let mut groups = vec![];
  if target.link.is_some() {
    groups.push(pick(&[OpenLinkInNewTab, CopyLink]));
  }
  if target.is_image && target.image.is_some() {
    groups.push(pick(&[OpenImageInNewTab, CopyImage, CopyImageAddress, SaveImage]));
  }
  if target.editable {
    groups.push(pick(&[Undo, Redo]));
    groups.push(pick(&[Cut, Copy, Paste, PasteAsPlainText, SelectAll]));
  } else if has_selection {
    groups.push(pick(&[Copy, SearchSelection]));
  }
  if target.link.is_none() && !target.is_image && !target.editable && !has_selection {
    groups.push(vec![
      PageMenuEntry { action: Back, enabled: target.can_go_back },
      PageMenuEntry { action: Forward, enabled: target.can_go_forward },
      PageMenuEntry { action: Reload, enabled: true },
    ]);
  }
  groups.push(pick(&[Inspect]));
  // HIG context-menus.md: hide what can't run now (Paste with nothing to paste, Back without
  // history) instead of dimming it.
  for group in &mut groups {
    group.retain(|e| e.enabled);
  }
  groups.retain(|g| !g.is_empty());
  groups
}

/// Whether `action` is in the menu that was shown (anything else from the UI is refused).
pub fn offered(groups: &[Vec<PageMenuEntry>], action: PageMenuAction) -> bool {
  groups.iter().flatten().any(|e| e.action == action && e.enabled)
}

#[cfg(test)]
mod tests {
  use super::*;
  use PageMenuAction::*;

  fn native(names: &[&str]) -> Vec<(String, bool)> {
    names.iter().map(|n| (n.to_string(), true)).collect()
  }

  fn actions(groups: &[Vec<PageMenuEntry>]) -> Vec<Vec<PageMenuAction>> {
    groups.iter().map(|g| g.iter().map(|e| e.action).collect()).collect()
  }

  #[test]
  fn the_page_background_gets_navigation_and_inspect() {
    let target = MenuTarget { can_go_back: true, ..Default::default() };
    let groups = groups(&target, &native(&["back", "forward", "reload", "saveAs", "print", "inspectElement"]));
    assert_eq!(actions(&groups), vec![vec![Back, Reload], vec![Inspect]], "forward without history is left out");
  }

  #[test]
  fn links_images_and_selections_get_their_own_groups() {
    let link = MenuTarget { link: Some("https://a.test/".into()), ..Default::default() };
    assert_eq!(actions(&groups(&link, &native(&["inspectElement"]))), vec![vec![OpenLinkInNewTab, CopyLink], vec![Inspect]]);

    let image = MenuTarget { is_image: true, image: Some("https://a.test/i.png".into()), ..Default::default() };
    let all = native(&["copyImage", "copyImageLocation", "saveImageAs", "inspectElement"]);
    assert_eq!(actions(&groups(&image, &all)), vec![vec![OpenImageInNewTab, CopyImage, CopyImageAddress, SaveImage], vec![Inspect]]);

    let text = MenuTarget { selection: Some("hello".into()), ..Default::default() };
    assert_eq!(actions(&groups(&text, &native(&["copy", "inspectElement"]))), vec![vec![Copy, SearchSelection], vec![Inspect]]);

    let linked_image = MenuTarget { link: Some("https://a.test/".into()), ..image };
    assert_eq!(actions(&groups(&linked_image, &all)).len(), 3, "link, image, inspect");
  }

  #[test]
  fn text_fields_get_editing_and_only_what_webview2_offers() {
    let field = MenuTarget { editable: true, ..Default::default() };
    let mut items = native(&["undo", "redo", "cut", "copy", "paste", "selectAll"]);
    items[4].1 = false; // empty clipboard
    let groups = groups(&field, &items);
    assert_eq!(actions(&groups), vec![vec![Undo, Redo], vec![Cut, Copy, SelectAll]], "no pasteAndMatchStyle offered, Paste hidden");
    assert!(!offered(&groups, Paste), "a hidden entry can't be chosen");
    assert!(offered(&groups, Cut));
    assert!(!offered(&groups, SearchSelection), "never offered here");
  }

  #[test]
  fn selection_previews_are_short_and_one_line() {
    assert_eq!(preview("  hello\n world "), "hello world");
    let long = "a".repeat(40);
    let p = preview(&long);
    assert_eq!(p.chars().count(), SELECTION_PREVIEW);
    assert!(p.ends_with('…'));
  }

  #[test]
  fn actions_serialize_by_name_and_reject_others() {
    assert_eq!(serde_json::to_value(OpenLinkInNewTab).unwrap(), "openLinkInNewTab");
    assert!(serde_json::from_str::<PageMenuAction>("\"runScript\"").is_err());
  }
}
