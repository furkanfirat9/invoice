import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Use hardcoded posting number
    const postingNumber = "33170857-0711-1";
    console.log(`Using posting number: ${postingNumber}`);

    // 2. Create or update invoice record
    const invoice = await prisma.invoice.upsert({
        where: { postingNumber: postingNumber },
        update: {
            invoiceNumber: "TEST-INV-001",
            amount: 100.50,
            currencyType: "USD",
            productCategory: "coffee-machine",
            countryOfOrigin: "TR",
            gtipCode: "851671000011",
            invoiceDate: new Date(),
            pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf" // Public dummy PDF
        },
        create: {
            postingNumber: postingNumber,
            invoiceNumber: "TEST-INV-001",
            amount: 100.50,
            currencyType: "USD",
            productCategory: "coffee-machine",
            countryOfOrigin: "TR",
            gtipCode: "851671000011",
            invoiceDate: new Date(),
            pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
        },
    });

    console.log("Invoice created/updated:", invoice);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
