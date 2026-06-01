import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const THIRTY_DAYS = 30 * 24 * 60 * 60;
const isProd = process.env.NODE_ENV === "production";

const BLOCKED_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.fr", "hotmail.co.uk", "hotmail.de", "hotmail.es", "hotmail.it",
  "outlook.com", "outlook.fr", "outlook.de", "outlook.es", "outlook.it",
  "live.com", "live.fr", "live.co.uk",
  "yahoo.com", "yahoo.fr", "yahoo.co.uk", "yahoo.de", "yahoo.es", "yahoo.it",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "protonmail.com", "proton.me",
  "mail.com", "gmx.com", "gmx.de", "gmx.fr",
  "msn.com", "wanadoo.fr", "orange.fr", "sfr.fr", "free.fr", "laposte.net",
  "yandex.com", "yandex.ru", "mail.ru",
]);

const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(",").map(e => e.trim().toLowerCase())
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id:   "email-only",
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase() ?? "";
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

        /* An explicit allowlist is the sole gate when configured — this lets
           the workspace owner sign in with any address (e.g. a personal
           Gmail) for their own tool. Set ALLOWED_EMAILS to your address(es). */
        if (ALLOWED_EMAILS.length > 0) {
          return ALLOWED_EMAILS.includes(email) ? { id: email, email, name: email } : null;
        }

        /* Otherwise fall back to a professional-domain gate. */
        const domain = email.split("@")[1];
        if (BLOCKED_DOMAINS.has(domain)) return null;
        return { id: email, email, name: email };
      },
    }),
  ],

  /* Trust the deployment host. Vercel auto-trusts, but this keeps sign-in
     working behind other hosts/proxies and avoids Auth.js UntrustedHost. */
  trustHost: true,

  session: { strategy: "jwt", maxAge: THIRTY_DAYS },

  ...(!isProd && {
    cookies: {
      sessionToken: {
        name: "authjs.session-token",
        options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
      },
    },
  }),

  pages: {
    signIn: "/login",
    error:  "/login",
  },

  callbacks: {
    /* Used by middleware to gate the workspace. */
    authorized({ auth: session, request: { nextUrl } }) {
      if (nextUrl.pathname.startsWith("/workspace")) return !!session?.user;
      return true;
    },
    async session({ session, token }) {
      if (token.email && session.user) session.user.id = token.email;
      return session;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },
  },
});