// Ezel is a desktop app: its sidebar is never shadcn's mobile Sheet. The registry hook switched to
// it below 768px, which a narrow window (the minimum is 400px) and every minimize (a 0px-wide
// window) crossed: the whole sidebar was torn down and rebuilt, losing its state, and menus
// measured a sidebar that wasn't there. shadcn's SidebarProvider reads this; nothing else does.
export function useIsMobile() {
  return false
}
