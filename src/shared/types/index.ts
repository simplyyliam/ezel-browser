// Data the backend sends or receives; see CLAUDE.md, "Contract". The shapes are generated from the
// Rust types (`shared/bindings.ts`, tauri-specta), so they can't drift from the backend; this file
// only names them for the rest of the app.

export type {
  Folder,
  Id,
  PageChanged,
  PageError,
  PageSecurity,
  Space,
  SpaceItem,
  Swatch,
  Tab,
  TabLocation,
  TabsState,
  WindowRadius,
} from "../bindings"
