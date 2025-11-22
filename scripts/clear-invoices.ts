const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    // Önce kaç kayıt var göster
    const count = await prisma.invoice.count();
    console.log(`\n📊 Toplam ${count} adet fatura kaydı bulundu.\n`);

    if (count === 0) {
        console.log('✅ Zaten temiz, silinecek kayıt yok.\n');
        return;
    }

    // Tüm kayıtları sil
    const result = await prisma.invoice.deleteMany({});
    console.log(`✅ ${result.count} adet fatura kaydı silindi.\n`);
    console.log('💡 Tablo yapısı ve kullanıcılar korundu.\n');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error('❌ Hata:', e);
        await prisma.$disconnect();
        process.exit(1);
    });
