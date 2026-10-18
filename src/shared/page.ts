/** Payload of the "page-changed" event emitted by Rust to the `ui` webview. */
export type PageChanged = {
  url: string
  title: string | null
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}
