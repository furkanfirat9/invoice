import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    // 1. Furkan'ın mağaza adını güncelle
    const furkanEmail = "elifirat009@outlook.com";
    await prisma.user.update({
        where: { email: furkanEmail },
        data: {
            storeName: "EFA Home Россия"
        }
    });
    console.log("Furkan mağaza adı güncellendi: EFA Home Россия");

    // 2. Mehmet'in mağaza adını güncelle
    const mehmetEmail = "mehmet@ozon.com";
    await prisma.user.update({
        where: { email: mehmetEmail },
        data: {
            storeName: "M-K КОМЗЕТИК"
        }
    });
    console.log("Mehmet mağaza adı güncellendi: M-K КОМЗЕТИК");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
