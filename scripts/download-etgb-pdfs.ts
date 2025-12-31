import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const prisma = new PrismaClient();

async function downloadFile(url: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destination);
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    file.close();
                    fs.unlinkSync(destination);
                    downloadFile(redirectUrl, destination).then(resolve).catch(reject);
                    return;
                }
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(destination);
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            file.close();
            if (fs.existsSync(destination)) {
                fs.unlinkSync(destination);
            }
            reject(err);
        });
    });
}

async function main() {
    console.log("=== 18 Kasım Sonrası ETGB PDF'lerini İndirme ===\n");

    // 18 Kasım 2025 tarihi
    const cutoffDate = new Date('2025-11-18T00:00:00.000Z');
    console.log(`📅 Filtre: ETGB Tarihi >= ${cutoffDate.toLocaleDateString('tr-TR')}\n`);

    // etgb klasörünü temizle ve oluştur
    const etgbDir = path.join(process.cwd(), 'etgb');
    if (fs.existsSync(etgbDir)) {
        // Mevcut PDF'leri sil
        const existingFiles = fs.readdirSync(etgbDir);
        for (const file of existingFiles) {
            fs.unlinkSync(path.join(etgbDir, file));
        }
        console.log(`🗑️  Mevcut ${existingFiles.length} dosya silindi.\n`);
    } else {
        fs.mkdirSync(etgbDir, { recursive: true });
    }

    // 18 Kasım sonrası ETGB'leri al
    const documents = await prisma.orderDocument.findMany({
        where: {
            etgbNo: { not: null },
            etgbPdfUrl: { not: null },
            etgbTarihi: { gte: cutoffDate }
        },
        select: {
            etgbNo: true,
            etgbPdfUrl: true,
            etgbTarihi: true,
            postingNumber: true
        }
    });

    console.log(`📋 18 Kasım sonrası toplam ${documents.length} sipariş bulundu.\n`);

    // ETGB numarasına göre grupla
    const uniqueEtgbs = new Map<string, { url: string; count: number; date: Date | null }>();

    for (const doc of documents) {
        if (doc.etgbNo && doc.etgbPdfUrl) {
            if (!uniqueEtgbs.has(doc.etgbNo)) {
                uniqueEtgbs.set(doc.etgbNo, {
                    url: doc.etgbPdfUrl,
                    count: 1,
                    date: doc.etgbTarihi
                });
            } else {
                uniqueEtgbs.get(doc.etgbNo)!.count++;
            }
        }
    }

    console.log(`📊 Toplam ${uniqueEtgbs.size} farklı ETGB PDF'i indirilecek...\n`);

    // Tarihe göre sırala
    const sortedEtgbs = Array.from(uniqueEtgbs.entries()).sort((a, b) => {
        if (!a[1].date) return 1;
        if (!b[1].date) return -1;
        return a[1].date.getTime() - b[1].date.getTime();
    });

    let downloaded = 0;
    let failed = 0;

    for (const [etgbNo, { url, count, date }] of sortedEtgbs) {
        const safeFileName = etgbNo.replace(/[<>:"/\\|?*]/g, '_');
        const dateStr = date ? date.toLocaleDateString('tr-TR') : 'Tarih yok';
        const fileName = `${safeFileName}.pdf`;
        const filePath = path.join(etgbDir, fileName);

        try {
            process.stdout.write(`⬇️  ${etgbNo} (${dateStr}, ${count} sipariş) indiriliyor...`);
            await downloadFile(url, filePath);
            console.log(' ✅');
            downloaded++;
        } catch (error: any) {
            console.log(` ❌ Hata: ${error.message}`);
            failed++;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n=== Özet ===`);
    console.log(`✅ İndirilen: ${downloaded}`);
    console.log(`❌ Başarısız: ${failed}`);
    console.log(`\n📁 PDF'ler: ${etgbDir}`);

    // Listeyi de yazdır
    console.log(`\n📋 İndirilen ETGB Listesi:`);
    for (const [etgbNo, { count, date }] of sortedEtgbs) {
        const dateStr = date ? date.toLocaleDateString('tr-TR') : 'Tarih yok';
        console.log(`   ${etgbNo} - ${dateStr} - ${count} sipariş`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
