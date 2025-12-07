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
            console.log("Auth Error: Missing credentials");
            throw new Error("E-posta ve şifre gereklidir");
          }

          const email = credentials.email.trim(); // Boşlukları temizle

          const user = await prisma.user.findUnique({
            where: {
              email: email,
            },
          });

          if (!user) {
            throw new Error("Kullanıcı bulunamadı");
          }

          // Şifre kontrolü
          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            throw new Error("Hatalı şifre");
          }

          return {
            id: user.id,
            email: user.email,
            name: user.role,
            role: user.role,
            storeName: user.storeName,
          };
        } catch (error: any) {
          console.error("Authorize critical error:", error.message);
          // Veritabanı bağlantı hatası kontrolü
          if (error.code === 'P1001') {
            throw new Error("Veritabanı bağlantı hatası. Lütfen daha sonra tekrar deneyin.");
          }
          throw error; // Hatayı tekrar fırlat ki NextAuth yakalasın
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.storeName = user.storeName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.storeName = token.storeName as string | null;
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


