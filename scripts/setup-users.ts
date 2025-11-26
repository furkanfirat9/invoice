import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    // 1. Mevcut kullanıcıyı (Elif Fırat) güncelle
    const mainUserEmail = "elifirat009@outlook.com";
    const mainUser = await prisma.user.findUnique({ where: { email: mainUserEmail } });

    if (mainUser) {
        await prisma.user.update({
            where: { email: mainUserEmail },
            data: {
                ozonClientId: "1830653",
                ozonApiKey: "cd46ff5e-5423-4f36-88df-a4530485b61d"
            }
        });
        console.log("Ana kullanıcı (Elif Fırat) Ozon bilgileriyle güncellendi.");
    } else {
        console.log("Ana kullanıcı bulunamadı!");
    }

    // 2. Mehmet kullanıcısını oluştur
    const mehmetEmail = "mehmet@ozon.com";
    const mehmetPassword = await bcrypt.hash("123456", 10);

    const mehmet = await prisma.user.upsert({
        where: { email: mehmetEmail },
        update: {
            ozonClientId: "3381799",
            ozonApiKey: "1ed7b7dd-aa50-436a-9dbf-230c078abdb9"
        },
        create: {
            email: mehmetEmail,
            password: mehmetPassword,
            role: "SELLER",
            ozonClientId: "3381799",
            ozonApiKey: "1ed7b7dd-aa50-436a-9dbf-230c078abdb9"
        }
    });

    console.log("Mehmet kullanıcısı oluşturuldu.");
    console.log("Email: mehmet@ozon.com");
    console.log("Şifre: 123456");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
