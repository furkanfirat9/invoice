import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    const userRole = token?.role as string | undefined;

    // Seller rotaları koruması
    if (pathname.startsWith("/dashboard")) {
      if (userRole !== "SELLER") {
        // Yetkisiz erişim - carrier ise kendi paneline, değilse login'e
        if (userRole === "CARRIER") {
          return NextResponse.redirect(new URL("/carrier", req.url));
        }
        return NextResponse.redirect(new URL("/login", req.url));
      }
    }

    // Carrier rotaları koruması
    if (pathname.startsWith("/carrier")) {
      if (userRole !== "CARRIER") {
        // Yetkisiz erişim - seller ise kendi paneline, değilse login'e
        if (userRole === "SELLER") {
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


