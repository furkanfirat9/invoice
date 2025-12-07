import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Fatura numarasının başka bir sipariş için kullanılıp kullanılmadığını kontrol et
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json(
                { error: "Oturum açmanız gerekiyor" },
                { status: 401 }
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const invoiceNumber = searchParams.get("invoiceNumber");
        const postingNumber = searchParams.get("postingNumber"); // Mevcut sipariş numarası (hariç tutulacak)

        if (!invoiceNumber) {
            return NextResponse.json(
                { error: "invoiceNumber parametresi gerekli" },
                { status: 400 }
            );
        }

        try {
            const existingInvoice = await prisma.invoice.findFirst({
                where: {
                    invoiceNumber: invoiceNumber,
                    ...(postingNumber && {
                        postingNumber: {
                            not: postingNumber
                        }
                    })
                },
                select: {
                    postingNumber: true
                }
            });

            if (existingInvoice) {
                return NextResponse.json({
                    isDuplicate: true,
                    existingPostingNumber: existingInvoice.postingNumber,
                    message: `Bu fatura numarası daha önce ${existingInvoice.postingNumber} numaralı gönderi için kullanılmış.`
                });
            }

            return NextResponse.json({
                isDuplicate: false,
                existingPostingNumber: null,
                message: null
            });

        } catch (dbError: any) {
            console.error("Database connection error:", dbError);
            if (dbError.code === 'P1001') {
                // Veritabanı bağlantı hatası - duplicate kontrolü yapılamadı
                return NextResponse.json({
                    isDuplicate: false,
                    existingPostingNumber: null,
                    message: null,
                    warning: "Veritabanı bağlantısı kurulamadı, kontrol yapılamadı."
                });
            }
            throw dbError;
        }

    } catch (error: any) {
        console.error("Invoice duplicate check error:", error);
        return NextResponse.json(
            { error: "Kontrol sırasında bir hata oluştu" },
            { status: 500 }
        );
    }
}
