// Shared by the start screen (which sets it after the password check) and the
// operator hub (which clears it on sign-out). Kept in one place so the two can
// never disagree about the key.
//
// This is the same demo-grade, client-side gate the operator console has always
// had — sessionStorage means it lasts for the tab, not longer.
export const AUTH_KEY = 'gridline_operator_authed';

export function signOutOperator() {
  try { sessionStorage.removeItem(AUTH_KEY); } catch { /* storage unavailable — nothing to clear */ }
}
