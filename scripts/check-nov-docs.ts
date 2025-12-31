import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("=== 1-18 Kasım Gönderileri ===\n");

    // 1-18 Kasım 2025 tarihleri
    const startDate = new Date('2025-11-01T00:00:00.000Z');
    const endDate = new Date('2025-11-18T23:59:59.999Z');

    console.log(`📅 Tarih Aralığı: ${startDate.toLocaleDateString('tr-TR')} - ${endDate.toLocaleDateString('tr-TR')}\n`);

    // Bu tarih aralığındaki OrderDocument kayıtlarını al
    const documents = await prisma.orderDocument.findMany({
        where: {
            OR: [
                // Satış faturası tarihi bu aralıkta
                {
                    satisFaturaTarihi: {
                        gte: startDate,
                        lte: endDate
                    }
                },
                // Veya ETGB tarihi bu aralıkta
                {
                    etgbTarihi: {
                        gte: startDate,
                        lte: endDate
                    }
                }
            ]
        },
        select: {
            postingNumber: true,
            satisPdfUrl: true,
            satisFaturaTarihi: true,
            satisFaturaNo: true,
            etgbPdfUrl: true,
            etgbTarihi: true,
            etgbNo: true,
            etgbTutar: true,
            etgbDovizCinsi: true
        },
        orderBy: {
            satisFaturaTarihi: 'asc'
        }
    });

    console.log(`📊 Toplam ${documents.length} kayıt bulundu.\n`);

    // Hem satış hem ETGB PDF'i olanları say
    const withBoth = documents.filter(d => d.satisPdfUrl && d.etgbPdfUrl);
    const withSalesOnly = documents.filter(d => d.satisPdfUrl && !d.etgbPdfUrl);
    const withEtgbOnly = documents.filter(d => !d.satisPdfUrl && d.etgbPdfUrl);

    console.log(`📋 İstatistikler:`);
    console.log(`   - Hem Satış hem ETGB PDF'i olan: ${withBoth.length}`);
    console.log(`   - Sadece Satış PDF'i olan: ${withSalesOnly.length}`);
    console.log(`   - Sadece ETGB PDF'i olan: ${withEtgbOnly.length}`);

    console.log(`\n📋 Hem Satış hem ETGB olan kayıtlar:\n`);
    for (const doc of withBoth.slice(0, 10)) {
        console.log(`   ${doc.postingNumber}`);
        console.log(`      Satış: ${doc.satisFaturaTarihi?.toLocaleDateString('tr-TR')} - ${doc.satisFaturaNo || 'No yok'}`);
        console.log(`      ETGB: ${doc.etgbTarihi?.toLocaleDateString('tr-TR')} - ${doc.etgbNo || 'No yok'} - ${doc.etgbTutar || '?'} ${doc.etgbDovizCinsi || ''}`);
        console.log('');
    }

    if (withBoth.length > 10) {
        console.log(`   ... ve ${withBoth.length - 10} kayıt daha`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
