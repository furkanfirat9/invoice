import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";

// Invoice kaydetme veya güncelleme
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: "Oturum açmanız gerekiyor" },
        { status: 401 }
      );
    }

    // Sadece SELLER rol kontrolü - CARRIER fatura kaydedemez
    if (session.user.role !== "SELLER") {
      return NextResponse.json(
        { error: "Bu işlem için yetkiniz yok" },
        { status: 403 }
      );
    }

    const userId = session.user.id;

    const formData = await request.formData();

    const postingNumber = formData.get("postingNumber") as string;
    const invoiceNumber = formData.get("invoiceNumber") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const productCategory = formData.get("productCategory") as string;
    const countryOfOrigin = formData.get("countryOfOrigin") as string;
    const invoiceDate = formData.get("invoiceDate") as string;
    const currencyType = formData.get("currencyType") as string;
    const gtipCode = formData.get("gtipCode") as string;
    const file = formData.get("file") as File;

    if (!postingNumber || !invoiceNumber || !file) {
      return NextResponse.json(
        { error: "Eksik alanlar var" },
        { status: 400 }
      );
    }

    // Mevcut fatura varsa owner kontrolü yap (başka seller'ın kaydını değiştirmesin)
    const existingInvoiceForOwnerCheck = await prisma.invoice.findUnique({
      where: { postingNumber },
      select: { userId: true, pdfUrl: true }
    });

    if (existingInvoiceForOwnerCheck && existingInvoiceForOwnerCheck.userId && existingInvoiceForOwnerCheck.userId !== userId) {
      return NextResponse.json(
        { error: "Bu fatura kaydını düzenleme yetkiniz yok" },
        { status: 403 }
      );
    }

    // Mevcut PDF URL'ini sakla (güncelleme durumunda eskisini silmek için)
    const oldPdfUrl = existingInvoiceForOwnerCheck?.pdfUrl;

    // Aynı fatura numarasının başka bir sipariş için kullanılıp kullanılmadığını kontrol et
    try {
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          invoiceNumber: invoiceNumber,
          postingNumber: {
            not: postingNumber // Kendisi hariç
          }
        },
        select: {
          postingNumber: true
        }
      });

      if (existingInvoice) {
        return NextResponse.json(
          {
            error: `Bu fatura numarası (${invoiceNumber}) daha önce ${existingInvoice.postingNumber} numaralı gönderi için kullanılmış. Lütfen farklı bir fatura numarası kullanın.`,
            code: "DUPLICATE_INVOICE_NUMBER",
            existingPostingNumber: existingInvoice.postingNumber
          },
          { status: 400 }
        );
      }
    } catch (checkError: any) {
      console.error("Invoice number check error:", checkError);
      // Veritabanı bağlantı hatası durumunda kontrol atlanır ve kayıt devam eder
      if (checkError.code !== 'P1001') {
        throw checkError;
      }
    }

    // Dosya boyutu kontrolü (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Dosya boyutu 5MB'dan büyük olamaz" },
        { status: 400 }
      );
    }

    // Sadece PDF kontrolü
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Sadece PDF dosyası yüklenebilir" },
        { status: 400 }
      );
    }

    // PDF dosyasını Vercel Blob'a yükle
    let pdfUrl: string | null = null;
    try {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw new Error("BLOB_READ_WRITE_TOKEN environment variable bulunamadı");
      }

      // Dosya ismini tahmin edilemez yap
      const randomId = crypto.randomUUID();
      const blob = await put(`invoices/${postingNumber}-${randomId}.pdf`, file, {
        access: "public",
        contentType: "application/pdf",
      });
      pdfUrl = blob.url;
      console.log("Blob uploaded successfully, URL:", pdfUrl);

      // Eski PDF varsa blob'dan sil (kaynak sızıntısını önle)
      if (oldPdfUrl && oldPdfUrl !== pdfUrl) {
        try {
          await del(oldPdfUrl);
          console.log("Old PDF deleted from blob:", oldPdfUrl);
        } catch (deleteError) {
          // Silme hatası kritik değil, log'la ve devam et
          console.error("Old PDF deletion failed:", deleteError);
        }
      }
    } catch (blobError: any) {
      console.error("Blob upload error:", blobError);
      // Blob yükleme hatası durumunda hata döndür
      return NextResponse.json(
        { error: "PDF dosyası yüklenemedi" },
        { status: 500 }
      );
    }

    // Invoice'ı veritabanına kaydet veya güncelle
    let invoice;
    try {
      invoice = await prisma.invoice.upsert({
        where: { postingNumber },
        update: {
          invoiceNumber,
          amount,
          productCategory,
          countryOfOrigin,
          invoiceDate: new Date(invoiceDate),
          currencyType,
          gtipCode,
          pdfUrl: pdfUrl || undefined,
          updatedAt: new Date(),
        },
        create: {
          postingNumber,
          invoiceNumber,
          amount,
          productCategory,
          countryOfOrigin,
          invoiceDate: new Date(invoiceDate),
          currencyType,
          gtipCode,
          pdfUrl: pdfUrl || undefined,
          userId: userId, // Owner olarak kaydet
        },
      });
    } catch (dbError: any) {
      // Veritabanı bağlantı hatası durumunda
      console.error("Database connection error:", dbError);
      if (dbError.code === 'P1001') {
        return NextResponse.json(
          {
            error: "Veritabanı bağlantı hatası",
            code: "DATABASE_CONNECTION_ERROR"
          },
          { status: 503 }
        );
      }
      // Diğer veritabanı hataları için hata döndür
      throw dbError;
    }

    console.log("Invoice saved with PDF URL:", invoice.pdfUrl);
    return NextResponse.json({ success: true, invoice });
  } catch (error: any) {
    console.error("Invoice save error:", error);
    return NextResponse.json(
      { error: "Fatura kaydedilemedi" },
      { status: 500 }
    );
  }
}

// Invoice yükleme (postingNumber'a göre)
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
    const postingNumber = searchParams.get("postingNumber");

    if (!postingNumber) {
      return NextResponse.json(
        { error: "postingNumber parametresi gerekli" },
        { status: 400 }
      );
    }

    let invoice;
    try {
      invoice = await prisma.invoice.findUnique({
        where: { postingNumber },
      });
    } catch (dbError: any) {
      // Veritabanı bağlantı hatası durumunda
      console.error("Database connection error:", dbError);
      // Veritabanı bağlantısı yoksa null döndür (uygulama çalışmaya devam edebilir)
      if (dbError.code === 'P1001') {
        console.warn("Database server is not reachable. Returning null invoice.");
        return NextResponse.json({ invoice: null });
      }
      // Diğer veritabanı hataları için hata döndür
      return NextResponse.json(
        { error: "Veritabanı hatası" },
        { status: 500 }
      );
    }

    if (!invoice) {
      return NextResponse.json({ invoice: null });
    }

    return NextResponse.json({ invoice });
  } catch (error: any) {
    console.error("Invoice load error:", error);
    return NextResponse.json(
      { error: "Fatura yüklenemedi" },
      { status: 500 }
    );
  }
}

