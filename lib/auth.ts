import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            throw new Error("E-posta ve şifre gereklidir");
          }

          const user = await prisma.user.findUnique({
            where: {
              email: credentials.email,
            },
          });

          if (!user) {
            console.log("Kullanıcı bulunamadı:", credentials.email);
            throw new Error("Kullanıcı bulunamadı");
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            console.log("Hatalı şifre:", credentials.email);
            throw new Error("Hatalı şifre");
          }

          return {
            id: user.id,
            email: user.email,
            name: user.role,
            role: user.role,
          };
        } catch (error) {
          console.error("Authorize error:", error);
          throw error; // Hatayı tekrar fırlat ki NextAuth yakalasın
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "gizli-anahtar-degistirilmeli",
};


