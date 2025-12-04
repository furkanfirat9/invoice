import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";
import crypto from "crypto";

// Upload PDF to Vercel Blob
async function uploadPdfToBlob(file: File, folder: string, postingNumber: string): Promise<string> {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw new Error("BLOB_READ_WRITE_TOKEN environment variable bulunamadı");
    }

    const randomId = crypto.randomUUID();
    const blob = await put(`${folder}/${postingNumber}-${randomId}.pdf`, file, {
        access: "public",
        contentType: "application/pdf",
    });
    return blob.url;
}

// Save or update order document
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email || !session?.user?.id) {
            return NextResponse.json({ error: "Oturum açmanız gerekiyor" }, { status: 401 });
        }

        // Only Elif can access this endpoint
        if (!isElif(session.user.email)) {
            return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
        }

        const formData = await request.formData();
        const postingNumber = formData.get("postingNumber") as string;

        if (!postingNumber) {
            return NextResponse.json({ error: "postingNumber gerekli" }, { status: 400 });
        }

        // Prepare update data
        const updateData: any = {};

        // Alış fields
        const alisFaturaNo = formData.get("alisFaturaNo") as string;
        const alisPdf = formData.get("alisPdf") as File | null;

        if (alisFaturaNo) {
            updateData.alisFaturaNo = alisFaturaNo;
        }
        if (alisPdf && alisPdf.size > 0) {
            if (alisPdf.type !== "application/pdf") {
                return NextResponse.json({ error: "Sadece PDF dosyası yüklenebilir" }, { status: 400 });
            }
            if (alisPdf.size > 5 * 1024 * 1024) {
                return NextResponse.json({ error: "Dosya boyutu 5MB'dan büyük olamaz" }, { status: 400 });
            }
            updateData.alisPdfUrl = await uploadPdfToBlob(alisPdf, "belgeler/alis", postingNumber);
        }

        // Satış fields
        const satisFaturaTarihi = formData.get("satisFaturaTarihi") as string;
        const satisFaturaNo = formData.get("satisFaturaNo") as string;
        const satisAliciAdSoyad = formData.get("satisAliciAdSoyad") as string;
        const satisPdf = formData.get("satisPdf") as File | null;

        if (satisFaturaTarihi) {
            updateData.satisFaturaTarihi = new Date(satisFaturaTarihi);
        }
        if (satisFaturaNo) {
            updateData.satisFaturaNo = satisFaturaNo;
        }
        if (satisAliciAdSoyad) {
            updateData.satisAliciAdSoyad = satisAliciAdSoyad;
        }
        if (satisPdf && satisPdf.size > 0) {
            if (satisPdf.type !== "application/pdf") {
                return NextResponse.json({ error: "Sadece PDF dosyası yüklenebilir" }, { status: 400 });
            }
            if (satisPdf.size > 5 * 1024 * 1024) {
                return NextResponse.json({ error: "Dosya boyutu 5MB'dan büyük olamaz" }, { status: 400 });
            }
            updateData.satisPdfUrl = await uploadPdfToBlob(satisPdf, "belgeler/satis", postingNumber);
        }

        // ETGB fields
        const etgbNo = formData.get("etgbNo") as string;
        const etgbTutar = formData.get("etgbTutar") as string;
        const etgbDovizCinsi = formData.get("etgbDovizCinsi") as string;
        const etgbPdf = formData.get("etgbPdf") as File | null;

        if (etgbNo) {
            updateData.etgbNo = etgbNo;
        }
        if (etgbTutar) {
            updateData.etgbTutar = parseFloat(etgbTutar);
        }
        if (etgbDovizCinsi) {
            updateData.etgbDovizCinsi = etgbDovizCinsi;
        }
        if (etgbPdf && etgbPdf.size > 0) {
            if (etgbPdf.type !== "application/pdf") {
                return NextResponse.json({ error: "Sadece PDF dosyası yüklenebilir" }, { status: 400 });
            }
            if (etgbPdf.size > 5 * 1024 * 1024) {
                return NextResponse.json({ error: "Dosya boyutu 5MB'dan büyük olamaz" }, { status: 400 });
            }
            updateData.etgbPdfUrl = await uploadPdfToBlob(etgbPdf, "belgeler/etgb", postingNumber);
        }

        // Upsert document
        const document = await prisma.orderDocument.upsert({
            where: { postingNumber },
            update: {
                ...updateData,
                updatedAt: new Date(),
            },
            create: {
                postingNumber,
                userId: session.user.id,
                ...updateData,
            },
        });

        return NextResponse.json({ success: true, document });
    } catch (error: any) {
        console.error("Order document save error:", error);
        return NextResponse.json(
            { error: error.message || "Belge kaydedilemedi" },
            { status: 500 }
        );
    }
}

// Get order document by postingNumber
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Oturum açmanız gerekiyor" }, { status: 401 });
        }

        if (!isElif(session.user.email)) {
            return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const postingNumber = searchParams.get("postingNumber");

        if (!postingNumber) {
            return NextResponse.json({ error: "postingNumber parametresi gerekli" }, { status: 400 });
        }

        // Fetch OrderDocument
        const document = await prisma.orderDocument.findUnique({
            where: { postingNumber },
        });

        // Also fetch Invoice from Sevkiyatlar if exists
        const invoice = await prisma.invoice.findUnique({
            where: { postingNumber },
            select: {
                invoiceNumber: true,
                invoiceDate: true,
                pdfUrl: true,
            },
        });

        return NextResponse.json({
            document: document || null,
            invoice: invoice || null,
        });
    } catch (error: any) {
        console.error("Order document load error:", error);
        return NextResponse.json(
            { error: "Belge yüklenemedi" },
            { status: 500 }
        );
    }
}
