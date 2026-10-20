//! Page layers: Ezel's one way to change how a website looks, by injecting a named CSS layer into
//! the shown tab (lenses now; Loupe and Palette Pull later reuse the path). Pure: names, CSS and the
//! scripts that add or remove a layer. The model tracks which layers a tab has; the runtime runs
//! these scripts in the page, and again on each new document while the layer is on.
//!
//! Security (pages are hostile): the scripts are built only from the constants below, never from
//! page content or UI input (the UI names a layer; serde rejects anything that isn't one). They run
//! in the page's top frame, define nothing global and send nothing back; tab webviews have no IPC.

use serde::{Deserialize, Serialize};
use specta::Type;

/// A named CSS layer. Serialized as its name ("squint").
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PageLayer {
  /// The squint test: blurs the page so only hierarchy and contrast remain.
  Squint,
  /// Removes colour: does the design still work without it?
  Greyscale,
}

/// Every lens sets its own custom property and this one rule composes them, so lenses stack (both
/// on = blurred and grey) instead of overriding each other's `filter`. Empty fallbacks keep the
/// declaration valid with only one of them set.
const COMPOSE: &str = "html{filter:var(--ezel-lens-squint,) var(--ezel-lens-greyscale,) !important}";

impl PageLayer {
  pub fn name(self) -> &'static str {
    match self {
      Self::Squint => "squint",
      Self::Greyscale => "greyscale",
    }
  }

  /// The layer's CSS. Blur 5px: enough to dissolve text into shapes at a normal reading distance.
  pub fn css(self) -> String {
    let own = match self {
      Self::Squint => ":root{--ezel-lens-squint:blur(5px)}",
      Self::Greyscale => ":root{--ezel-lens-greyscale:grayscale(1)}",
    };
    format!("{own}{COMPOSE}")
  }

  fn element_id(self) -> String {
    format!("ezel-layer-{}", self.name())
  }

  /// Adds (or refreshes) the layer's `<style>` in the top frame. Idempotent, so it can run on every
  /// new document. At the start of a navigation `<html>` may not exist yet: it waits for it.
  pub fn apply_script(self) -> String {
    let id = json(&self.element_id());
    let css = json(&self.css());
    format!(
      "(()=>{{if(window.top!==window)return;const id={id},css={css};\
const put=()=>{{let s=document.getElementById(id);if(!s){{s=document.createElement('style');s.id=id;}}\
s.textContent=css;if(s.parentNode!==document.documentElement)document.documentElement.appendChild(s);}};\
if(document.documentElement)put();else new MutationObserver((_,o)=>{{if(document.documentElement){{o.disconnect();put();}}}})\
.observe(document,{{childList:true}});}})();"
    )
  }

  /// Removes the layer's `<style>` from the top frame.
  pub fn remove_script(self) -> String {
    let id = json(&self.element_id());
    format!("(()=>{{if(window.top!==window)return;document.getElementById({id})?.remove();}})();")
  }
}

/// A JS string literal (quotes and escapes handled by serde_json).
fn json(s: &str) -> String {
  serde_json::to_string(s).expect("a string always serializes")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn names_match_the_contract() {
    assert_eq!(serde_json::to_value(PageLayer::Squint).unwrap(), "squint");
    assert_eq!(serde_json::from_str::<PageLayer>("\"greyscale\"").unwrap(), PageLayer::Greyscale);
    assert!(serde_json::from_str::<PageLayer>("\"javascript:alert(1)\"").is_err(), "only known layers");
  }

  #[test]
  fn lenses_compose_instead_of_overriding_each_other() {
    for layer in [PageLayer::Squint, PageLayer::Greyscale] {
      let css = layer.css();
      assert!(css.contains(COMPOSE), "{css}");
      assert!(css.contains(&format!("--ezel-lens-{}:", layer.name())), "{css}");
    }
  }

  #[test]
  fn scripts_touch_only_their_own_element_in_the_top_frame() {
    let apply = PageLayer::Squint.apply_script();
    assert!(apply.starts_with("(()=>{if(window.top!==window)return;"));
    assert!(apply.contains(r#"const id="ezel-layer-squint""#));
    assert!(apply.contains(&json(&PageLayer::Squint.css())));
    let remove = PageLayer::Greyscale.remove_script();
    assert!(remove.contains(r#"getElementById("ezel-layer-greyscale")?.remove()"#));
    for script in [&apply, &remove] {
      assert!(!script.contains("__TAURI"), "no bridge to the app");
      assert!(!script.contains("fetch(") && !script.contains("postMessage"), "sends nothing back");
    }
  }
}
