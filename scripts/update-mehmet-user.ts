import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Mehmet kullanıcısı güncelleniyor...\n');

    // Yeni şifreyi hashle
    const hashedPassword = await bcrypt.hash('Mehmet35TR', 10);

    // Mehmet kullanıcısını güncelle
    const updatedUser = await prisma.user.update({
        where: {
            email: 'mehmet@ozon.com'
        },
        data: {
            email: 'Mehmet',
            password: hashedPassword
        }
    });

    console.log('✅ Kullanıcı başarıyla güncellendi:');
    console.log(`   Email: ${updatedUser.email}`);
    console.log(`   Şifre: Mehmet35TR (hashlenmiş)`);
    console.log(`   Rol: ${updatedUser.role}`);
    console.log(`   Mağaza: ${updatedUser.storeName || '-'}\n`);
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
