// Layout for /dashboard-v2 only. Establishes the v2 route's own layout
// boundary so the route opts out of AppShell (configured in
// components/AppShell.jsx via AUTH_PATHS). The new sidebar + topbar
// chrome will be added inside this layout in Phase B.2b.

export default function DashboardV2Layout({ children }) {
  return children;
}
