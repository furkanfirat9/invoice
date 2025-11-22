import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Veritabanı bağlantısını test et
export async function GET() {
  try {
    // DATABASE_URL kontrolü
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      return NextResponse.json(
        {
          connected: false,
          error: "DATABASE_URL environment variable bulunamadı",
          details: "Lütfen .env dosyasında DATABASE_URL'i kontrol edin",
        },
        { status: 503 }
      );
    }

    // Veritabanı bağlantısını test et
    await prisma.$connect();
    
    // Basit bir sorgu çalıştır
    await prisma.$queryRaw`SELECT 1`;
    
    return NextResponse.json({
      connected: true,
      message: "Veritabanı bağlantısı başarılı",
      databaseUrl: databaseUrl.replace(/:[^:@]+@/, ":****@"), // Şifreyi gizle
    });
  } catch (error: any) {
    console.error("Database connection test error:", error);
    
    return NextResponse.json(
      {
        connected: false,
        error: "Veritabanı bağlantı hatası",
        details: error.message,
        code: error.code || "UNKNOWN",
        databaseUrl: process.env.DATABASE_URL 
          ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ":****@")
          : "NOT SET",
      },
      { status: 503 }
    );
  }
}

