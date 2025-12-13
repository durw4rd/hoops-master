import GoogleProvider from "next-auth/providers/google";
import type { AuthOptions } from "next-auth";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, token }: { session: any; token: any }) {
      if (session?.user) {
        session.user.email = token.email;
        session.user.name = token.name;
      }
      return session;
    },
    async jwt({ token, account, profile }: { token: any; account?: any; profile?: any }) {
      if (account && profile) {
        token.email = profile.email;
        token.name = profile.name;
      }
      return token;
    },
  },
};

