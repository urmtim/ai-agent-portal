// Next.js 16 "proxy" convention (formerly middleware). It runs on Node.js, so it uses the full
// auth from auth.ts: the session is re-checked against the DB and the /admin gate sees the current role.
import { auth } from "./auth";

export default auth;

export const config = {
  // Protect everything except auth endpoints, the public auth pages and static assets.
  matcher: [
    "/((?!api/auth|login|invite|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
