import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("=== ETGB İstatistikleri ===\n");

    // OrderDocument tablosundan farklı ETGB numaralarını al
    const orderDocResult = await prisma.orderDocument.groupBy({
        by: ['etgbNo'],
        where: {
            etgbNo: { not: null }
        },
        _count: {
            postingNumber: true
        }
    });

    // Toplam sipariş sayısı (ETGB'li)
    const totalWithEtgb = await prisma.orderDocument.count({
        where: {
            etgbNo: { not: null }
        }
    });

    // Farklı ETGB numaralarını listele
    const uniqueEtgbNumbers = orderDocResult.filter(r => r.etgbNo !== null);

    console.log(`📊 OrderDocument Tablosu:`);
    console.log(`   - Toplam ETGB'li sipariş: ${totalWithEtgb}`);
    console.log(`   - Farklı ETGB numarası: ${uniqueEtgbNumbers.length}`);
    console.log(`\n📋 ETGB Numaraları ve Sipariş Sayıları:\n`);

    // ETGB numaralarını sipariş sayısına göre sırala (çoktan aza)
    const sorted = uniqueEtgbNumbers.sort((a, b) => b._count.postingNumber - a._count.postingNumber);

    for (const item of sorted) {
        console.log(`   ${item.etgbNo}: ${item._count.postingNumber} sipariş`);
    }

    // Invoice tablosunu da kontrol et
    const invoiceResult = await prisma.invoice.groupBy({
        by: ['etgbNumber'],
        where: {
            etgbNumber: { not: null }
        },
        _count: {
            postingNumber: true
        }
    });

    const totalInvoiceWithEtgb = await prisma.invoice.count({
        where: {
            etgbNumber: { not: null }
        }
    });

    const uniqueInvoiceEtgb = invoiceResult.filter(r => r.etgbNumber !== null);

    console.log(`\n\n📊 Invoice Tablosu:`);
    console.log(`   - Toplam ETGB'li kayıt: ${totalInvoiceWithEtgb}`);
    console.log(`   - Farklı ETGB numarası: ${uniqueInvoiceEtgb.length}`);

    if (uniqueInvoiceEtgb.length > 0) {
        console.log(`\n📋 ETGB Numaraları ve Kayıt Sayıları:\n`);
        const sortedInvoice = uniqueInvoiceEtgb.sort((a, b) => b._count.postingNumber - a._count.postingNumber);
        for (const item of sortedInvoice) {
            console.log(`   ${item.etgbNumber}: ${item._count.postingNumber} kayıt`);
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
