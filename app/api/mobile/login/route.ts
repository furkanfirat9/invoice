import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json(
                { success: false, error: "Kullanıcı adı ve şifre gerekli" },
                { status: 400 }
            );
        }

        // Kullanıcıyı bul (email veya username olarak dene)
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: username },
                    { email: username.includes("@") ? username : `${username}@example.com` },
                ],
            },
        });

        if (!user) {
            return NextResponse.json(
                { success: false, error: "Kullanıcı bulunamadı" },
                { status: 401 }
            );
        }

        // Şifre kontrolü
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return NextResponse.json(
                { success: false, error: "Geçersiz şifre" },
                { status: 401 }
            );
        }

        // Sadece satıcı (SELLER) rolüne izin ver
        if (user.role !== "SELLER") {
            return NextResponse.json(
                { success: false, error: "Bu uygulama sadece satıcılar için" },
                { status: 403 }
            );
        }

        // Başarılı giriş
        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Mobile login error:", error);
        return NextResponse.json(
            { success: false, error: "Sunucu hatası" },
            { status: 500 }
        );
    }
}
