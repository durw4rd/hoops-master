/**
 * Role labels + capability helpers shared by client and server.
 *
 * App roles:  owner > admin > user
 * Crew roles: admin (Crew Capo) > coleader (King) > member (Crew)
 *
 * Stored values stay 'admin'/'member' for back-compat; only display labels and
 * the new 'coleader'/'owner' values are layered on top.
 */

import type { GlobalRole, GroupRole } from '@/lib/types';

export const CREW_ROLE_LABELS: Record<GroupRole, string> = {
  admin: 'Crew Capo',
  coleader: 'King',
  member: 'Crew',
};

export const APP_ROLE_LABELS: Record<GlobalRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  user: 'Player',
};

export function crewRoleLabel(role: string): string {
  return CREW_ROLE_LABELS[role as GroupRole] ?? 'Crew';
}

export function appRoleLabel(role: string): string {
  return APP_ROLE_LABELS[role as GlobalRole] ?? 'Player';
}

/** App admins (owner or admin) can create crews, invite, and manage app roles. */
export function isAppAdminRole(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

/** The Crew Capo (crew leader) — full crew control incl. settings + roles. */
export function isCapo(role: string): boolean {
  return role === 'admin';
}

/** Capo or King — can manage events and add members. */
export function isCrewManager(role: string): boolean {
  return role === 'admin' || role === 'coleader';
}
