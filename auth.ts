import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Server-side only (needs Prisma): every session read re-checks the user in this DB.
    // Deleted / disabled / unknown here (e.g. a cookie from another portal on the same host) → no session;
    // the role is taken fresh, so changes apply without signing in again.
    async jwt(params) {
      const token = authConfig.callbacks.jwt(params);
      if (params.user) return token;
      const user = token.id ? await prisma.user.findUnique({ where: { id: token.id as string }, select: { status: true, role: true } }) : null;
      if (!user || user.status !== "ACTIVE") return null;
      token.role = user.role;
      return token;
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || user.status !== "ACTIVE" || !user.passwordHash) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});
