import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

// Edge-safe config (no Prisma / bcrypt here) — shared by the middleware
// and the full server config in auth.ts.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  // Own cookie name per instance (AUTH_SESSION_COOKIE): browsers share cookies across ports,
  // so the Docker copy on :3080 and `npm run dev` on :3000 would otherwise overwrite each other.
  ...(process.env.AUTH_SESSION_COOKIE && {
    cookies: {
      sessionToken: {
        name: process.env.AUTH_SESSION_COOKIE,
        options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.APP_URL?.startsWith("https://") ?? false },
      },
    },
  }),
  callbacks: {
    // Runs in the middleware for every protected route.
    authorized({ auth, request: { nextUrl } }) {
      const user = auth?.user;
      if (!user) return false; // -> redirect to /login

      // Admin area is ADMIN-only; others get bounced to their courses.
      if (nextUrl.pathname.startsWith("/admin") && user.role !== "ADMIN") {
        return Response.redirect(new URL("/", nextUrl));
      }
      return true;
    },
    // Copy id/role onto the token on sign-in (pure, no DB).
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
  providers: [], // added in auth.ts
} satisfies NextAuthConfig;
