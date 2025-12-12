
const API_KEY = "98662444-ad03-41c2-ae14-f8467d0959b6";
const CLIENT_ID = "1830653";

async function checkProductImages() {
    const sku = 1565847107;

    // Try /v3/product/info/list with offer_id
    const productUrl = "https://api-seller.ozon.ru/v3/product/info/list";

    const productBody = {
        offer_id: ["G88D874G5"]  // Use offer_id instead
    };

    const productResponse = await fetch(productUrl, {
        method: 'POST',
        headers: {
            'Client-Id': CLIENT_ID,
            'Api-Key': API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(productBody)
    });

    console.log("=== V3 PRODUCT INFO LIST ===");
    console.log("Status:", productResponse.status);
    const data = await productResponse.json();
    console.log(JSON.stringify(data, null, 2));
}

checkProductImages();
