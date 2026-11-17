const PENDING_INVITATION = 'dialo_pending_invitation';
export const validInvitationCode = (codigo) => /^[A-Za-z0-9_-]{1,16}$/.test(codigo ?? '');
export const invitationPath = (codigo) => `/invitacion/${encodeURIComponent(codigo)}`;

// Solo se permiten destinos internos de invitación: nunca URLs arbitrarias.
export function invitationReturnPath(value) {
  return typeof value === 'string' && /^\/invitacion\/[A-Za-z0-9_-]{1,16}$/.test(value) ? value : null;
}
export function rememberInvitation(path) {
  const safe = invitationReturnPath(path);
  if (safe) try { sessionStorage.setItem(PENDING_INVITATION, safe); } catch { /* state del router sigue disponible */ }
}
export function pendingInvitation() {
  try { return invitationReturnPath(sessionStorage.getItem(PENDING_INVITATION)); } catch { return null; }
}
export function clearPendingInvitation() {
  try { sessionStorage.removeItem(PENDING_INVITATION); } catch { /* almacenamiento deshabilitado */ }
}
export function invitationStatus(invitation, now = Date.now()) {
  if (invitation.estado === 'REVOCADA') return 'REVOCADA';
  if (invitation.estado === 'VENCIDA' || (invitation.fechaExpiracion && new Date(invitation.fechaExpiracion).getTime() <= now)) return 'VENCIDA';
  if (invitation.estado === 'AGOTADA' || (invitation.usosMaximos !== null && invitation.usos >= invitation.usosMaximos)) return 'AGOTADA';
  return 'ACTIVA';
}
