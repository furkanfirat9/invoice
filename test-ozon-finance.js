require('dotenv/config');

const OZON_API_BASE = "https://api-seller.ozon.ru";
const CLIENT_ID = process.env.OZON_CLIENT_ID || "1830653";
const API_KEY = process.env.OZON_API_KEY || "98662444-ad03-41c2-ae14-f8467d0959b6";

async function fetchFinanceData(postingNumber) {
    const response = await fetch(`${OZON_API_BASE}/v3/finance/transaction/list`, {
        method: "POST",
        headers: {
            "Client-Id": CLIENT_ID,
            "Api-Key": API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            filter: {
                posting_number: postingNumber,
                date: { from: "2024-01-01T00:00:00.000Z", to: "2026-12-31T23:59:59.999Z" }
            },
            page: 1,
            page_size: 100
        }),
    });
    return response.json();
}

async function findPaidOrders() {
    console.log("=== ÖDEMESİ DÜŞMÜŞ SİPARİŞ ARANIYOR ===");

    // Ekim ayından sipariş alalım (kesin ödenmiştir)
    const startDate = new Date("2025-10-01T00:00:00Z");
    const endDate = new Date("2025-10-31T23:59:59Z");

    try {
        const response = await fetch(`${OZON_API_BASE}/v3/posting/fbs/list`, {
            method: "POST",
            headers: {
                "Client-Id": CLIENT_ID,
                "Api-Key": API_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                dir: "ASC",
                filter: {
                    since: startDate.toISOString(),
                    to: endDate.toISOString(),
                    status: "delivered"
                },
                limit: 10,
                offset: 0,
            }),
        });

        const data = await response.json();
        const postings = data.result?.postings || [];

        console.log(`\nEkim ayında ${postings.length} teslim edilmiş sipariş bulundu.\n`);

        // Her birinin teslim tarihini Finance API'den kontrol et
        for (const p of postings.slice(0, 3)) {
            console.log(`\n--- ${p.posting_number} ---`);

            const financeData = await fetchFinanceData(p.posting_number);
            const ops = financeData.result?.operations || [];

            const deliveryOp = ops.find(op => op.operation_type === 'OperationAgentDeliveredToCustomer');

            if (deliveryOp) {
                const deliveryDate = new Date(deliveryOp.operation_date);
                const day = deliveryDate.getDate();

                let calcDate, payDate;
                if (day <= 15) {
                    calcDate = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth(), 16);
                    payDate = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth(), 20);
                } else {
                    calcDate = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth() + 1, 1);
                    payDate = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth() + 1, 10);
                }

                const isPaid = payDate < new Date();

                console.log("Sipariş:", p.in_process_at?.split('T')[0]);
                console.log("Teslim:", deliveryOp.operation_date.split(' ')[0]);
                console.log("Hesaplama:", calcDate.toISOString().split('T')[0]);
                console.log("Ödeme:", payDate.toISOString().split('T')[0]);
                console.log("Ödendi mi?", isPaid ? "EVET ✓" : "HAYIR");
                console.log("Net RUB:", deliveryOp.amount);
            }
        }

    } catch (error) {
        console.error("Hata:", error.message);
    }
}

findPaidOrders();
