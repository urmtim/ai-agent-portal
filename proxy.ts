import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

// Next.js 16 "proxy" convention (formerly middleware).
export default auth;

export const config = {
  // Protect everything except auth endpoints, the public auth pages and static assets.
  matcher: [
    "/((?!api/auth|login|invite|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
