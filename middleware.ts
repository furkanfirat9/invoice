import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";

export default withAuth(
  function middleware(req) {
    const { token } = req.nextauth;
    const pathname = req.nextUrl.pathname;

    // Seller rotaları koruması
    if (pathname.startsWith("/dashboard")) {
      if (token?.role !== UserRole.SELLER) {
        // Yetkisiz erişim - carrier ise kendi paneline, değilse login'e
        if (token?.role === UserRole.CARRIER) {
          return NextResponse.redirect(new URL("/carrier", req.url));
        }
        return NextResponse.redirect(new URL("/login", req.url));
      }
    }

    // Carrier rotaları koruması
    if (pathname.startsWith("/carrier")) {
      if (token?.role !== UserRole.CARRIER) {
        // Yetkisiz erişim - seller ise kendi paneline, değilse login'e
        if (token?.role === UserRole.SELLER) {
          return NextResponse.redirect(new URL("/dashboard", req.url));
        }
        return NextResponse.redirect(new URL("/login", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/carrier/:path*"],
};


