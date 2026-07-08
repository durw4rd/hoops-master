/**
 * Session helpers for API routes.
 *
 * The DB user id and global_role are cached in the JWT (see lib/auth.ts), so we
 * avoid an email->id lookup on every request. Falls back to a DB lookup if the
 * token predates the id (e.g. an old session).
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserRowByEmail } from '@/lib/queries/users';

export interface SessionUser {
  id: string;
  email: string;
  globalRole: string;
}

/**
 * Returns the authenticated user (id, email, role) or null if not signed in.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;

  const id = session.user.id;
  const globalRole = session.user.globalRole;
  if (id && globalRole) {
    return { id, email, globalRole };
  }

  // Fallback for sessions issued before id/role were on the token.
  const dbUser = await getUserRowByEmail(email);
  if (!dbUser || dbUser.removedAt) return null;
  return { id: dbUser.id, email: dbUser.email, globalRole: dbUser.globalRole };
}
