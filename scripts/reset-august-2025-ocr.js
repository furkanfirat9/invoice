// Script to reset OCR data for August 2025
// Run this script once to clear OCR fields while keeping PDFs

const resetOcrData = async () => {
    console.log("🔄 Starting OCR data reset for August 2025...\n");

    try {
        const response = await fetch("http://localhost:3000/api/order-documents/reset-ocr", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Note: This needs to be run from browser console while logged in
            },
            body: JSON.stringify({
                year: 2025,
                month: 8, // August
                resetAlis: true,
                resetSatis: true,
                resetEtgb: true
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log("✅ Reset completed successfully!");
            console.log(`📊 Found: ${data.totalFound} documents`);
            console.log(`🔄 Reset: ${data.resetCount} documents`);
            console.log("📁 PDFs preserved!");
        } else {
            console.error("❌ Error:", data.error);
        }
    } catch (error) {
        console.error("❌ Request failed:", error);
    }
};

// To run this:
// 1. Open your app in browser (http://localhost:3000)
// 2. Login as Elif
// 3. Open browser console (F12)
// 4. Paste and run: resetOcrData()

console.log(`
===========================================
  August 2025 OCR Data Reset Script
===========================================

To reset OCR data while keeping PDFs:

1. Open http://localhost:3000 in browser
2. Login as authorized user
3. Open browser console (F12 > Console)
4. Copy and paste the following code:

fetch("/api/order-documents/reset-ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        year: 2025,
        month: 8,
        resetAlis: true,
        resetSatis: true,
        resetEtgb: true
    })
}).then(r => r.json()).then(console.log);

5. Press Enter to execute

This will:
✅ Clear all OCR text fields for August 2025
✅ Keep all PDF files intact
✅ Allow you to re-run Batch OCR

===========================================
`);
