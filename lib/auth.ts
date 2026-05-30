import GoogleProvider from "next-auth/providers/google";
import type { AuthOptions } from "next-auth";
import { getUserRowByEmail } from "./queries/users";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    // Surface invite-only denials on the home page (?error=AccessDenied).
    signIn: "/",
    error: "/",
  },
  callbacks: {
    async signIn({ user }) {
      // Invite-only: allow sign-in only if an account already exists for this
      // email (created by an admin invite or the seed). Never auto-provision.
      if (!user?.email) return false;
      try {
        const existing = await getUserRowByEmail(user.email);
        return !!existing;
      } catch (error) {
        console.error('Error checking invite allowlist:', error);
        // Fail closed: deny if we can't verify the allowlist.
        return false;
      }
    },
    async session({ session, token }: { session: any; token: any }) {
      if (session?.user) {
        session.user.email = token.email;
        session.user.name = token.name;
        session.user.id = token.userId; // DB user id (UUID)
        session.user.globalRole = token.globalRole;
      }
      return session;
    },
    async jwt({ token, account, profile }: { token: any; account?: any; profile?: any }) {
      if (account && profile) {
        token.email = profile.email;
        token.name = profile.name;
      }
      // Resolve and cache the DB user id + role on the token. Done on first sign-in
      // (account/profile present) and refreshed if missing.
      if (token.email && (!token.userId || (account && profile))) {
        try {
          const dbUser = await getUserRowByEmail(token.email as string);
          if (dbUser) {
            token.userId = dbUser.id;
            token.globalRole = dbUser.globalRole;
          }
        } catch (error) {
          console.error('Error resolving user id for JWT:', error);
        }
      }
      return token;
    },
  },
};
