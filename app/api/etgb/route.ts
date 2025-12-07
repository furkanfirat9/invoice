import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";

// ETGB bilgilerini getir
export async function GET(request: NextRequest) {
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
      { error: "Posting number gereklidir" },
      { status: 400 }
    );
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { postingNumber },
      select: {
        etgbPdfUrl: true,
        etgbDate: true,
        etgbNumber: true,
        id: true,
      },
    });

    return NextResponse.json({ etgb: invoice });
  } catch (error) {
    console.error("ETGB getirme hatası:", error);
    return NextResponse.json(
      { error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

// ETGB yükle/güncelle
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: "Oturum açmanız gerekiyor" },
        { status: 401 }
      );
    }

    // Sadece CARRIER rol kontrolü - ETGB kargonun işi
    if (session.user.role !== "CARRIER") {
      return NextResponse.json(
        { error: "Bu işlem için yetkiniz yok" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const postingNumber = formData.get("postingNumber") as string;
    const file = formData.get("file") as File;
    const etgbNumber = formData.get("etgbNumber") as string || "";

    if (!postingNumber) {
      return NextResponse.json(
        { error: "Posting number gereklidir" },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { error: "Dosya gereklidir" },
        { status: 400 }
      );
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

    // Dosyayı Vercel Blob'a yükle
    const randomId = crypto.randomUUID();
    const blob = await put(`etgb/${postingNumber}-${randomId}.pdf`, file, {
      access: "public",
    });

    // Veritabanını güncelle (upsert mantığı ile Invoice kaydı varsa güncelle, yoksa oluştur)
    // Ancak Invoice kaydı normalde Seller tarafından oluşturulmuş olmalı.
    // Eğer Seller henüz fatura girmediyse ETGB girilebilir mi? 
    // Evet, bu yüzden upsert kullanacağız.

    const invoice = await prisma.invoice.upsert({
      where: { postingNumber },
      update: {
        etgbPdfUrl: blob.url,
        etgbDate: new Date(),
        etgbNumber: etgbNumber,
      },
      create: {
        postingNumber,
        invoiceNumber: "", // Boş bırakıyoruz, seller dolduracak
        amount: 0,
        productCategory: "",
        countryOfOrigin: "",
        invoiceDate: new Date(),
        gtipCode: "",
        etgbPdfUrl: blob.url,
        etgbDate: new Date(),
        etgbNumber: etgbNumber,
      },
    });

    return NextResponse.json({ success: true, etgb: invoice });
  } catch (error) {
    console.error("ETGB yükleme hatası:", error);
    return NextResponse.json(
      { error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

// ETGB sil
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: "Oturum açmanız gerekiyor" },
        { status: 401 }
      );
    }

    // Sadece CARRIER rol kontrolü - ETGB kargonun işi
    if (session.user.role !== "CARRIER") {
      return NextResponse.json(
        { error: "Bu işlem için yetkiniz yok" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const postingNumber = searchParams.get("postingNumber");

    if (!postingNumber) {
      return NextResponse.json(
        { error: "Posting number gereklidir" },
        { status: 400 }
      );
    }

    // Önce mevcut kaydı bulup URL'i alalım
    const existingInvoice = await prisma.invoice.findUnique({
      where: { postingNumber },
      select: { etgbPdfUrl: true }
    });

    if (existingInvoice?.etgbPdfUrl) {
      try {
        // Blob'dan sil
        await del(existingInvoice.etgbPdfUrl);
      } catch (blobError) {
        console.error("Blob silme hatası:", blobError);
        // Blob silinemese bile veritabanından silmeye devam et
      }
    }

    // Veritabanında ETGB alanlarını temizle
    const invoice = await prisma.invoice.update({
      where: { postingNumber },
      data: {
        etgbPdfUrl: null,
        etgbDate: null,
        etgbNumber: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ETGB silme hatası:", error);
    return NextResponse.json(
      { error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}


