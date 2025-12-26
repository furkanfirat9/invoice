// Ozon API test scripti
require('dotenv').config();

const OZON_CLIENT_ID = process.env.OZON_CLIENT_ID;
const OZON_API_KEY = process.env.OZON_API_KEY;
const OZON_API_BASE = process.env.OZON_API_BASE || 'https://api-seller.ozon.ru';

async function fetchOzonOrders() {
    const url = `${OZON_API_BASE}/v3/posting/fbs/list`;

    const body = {
        dir: "DESC",
        filter: {
            since: "2024-12-01T00:00:00Z",
            to: "2024-12-31T23:59:59Z"
        },
        limit: 5, // Sadece 5 tane al test için
        offset: 0,
        with: {
            analytics_data: true,
            financial_data: true
        }
    };

    console.log('İstek atılıyor:', url);
    console.log('Client ID:', OZON_CLIENT_ID);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Client-Id': OZON_CLIENT_ID,
            'Api-Key': OZON_API_KEY
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        console.error('Hata:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Hata detayı:', errorText);
        return;
    }

    const data = await response.json();

    console.log('\n=== TOPLAM SİPARİŞ ===');
    console.log('Dönen sipariş sayısı:', data.result?.postings?.length || 0);

    if (data.result?.postings?.length > 0) {
        console.log('\n=== İLK SİPARİŞ DETAYI ===');
        console.log(JSON.stringify(data.result.postings[0], null, 2));
    }
}

fetchOzonOrders().catch(console.error);
