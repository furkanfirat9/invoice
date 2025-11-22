const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
    // 1. Seller Kullanıcısı
    const sellerPassword = await bcrypt.hash('45125421', 10);
    const seller = await prisma.user.upsert({
        where: { email: 'elifirat009@outlook.com' },
        update: {
            password: sellerPassword,
            role: 'SELLER',
        },
        create: {
            email: 'elifirat009@outlook.com',
            password: sellerPassword,
            role: 'SELLER',
        },
    });
    console.log('Seller oluşturuldu:', seller);
    // 2. Carrier Kullanıcısı Güncellemesi
    const carrierPassword = await bcrypt.hash('Spegat34TR', 10);
    // Eski carrier kullanıcısını sil
    try {
        await prisma.user.delete({ where: { email: 'kargo@efahome.com' } });
        console.log('Eski carrier silindi.');
    }
    catch (e) {
        // Kullanıcı yoksa devam et
    }
    // Yeni Carrier: SPEGAT
    const carrier = await prisma.user.upsert({
        where: { email: 'SPEGAT' },
        update: {
            password: carrierPassword,
            role: 'CARRIER',
        },
        create: {
            email: 'SPEGAT', // Email alanına kullanıcı adı yazıyoruz
            password: carrierPassword,
            role: 'CARRIER',
        },
    });
    console.log('Carrier güncellendi:', carrier);
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
