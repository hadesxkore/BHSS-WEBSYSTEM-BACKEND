import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import puppeteer from "puppeteer";

/**
 * Converts a DOCX file to PDF.
 * Returns the output PDF file path on success, or null on failure.
 */
export async function convertDocxToPdf(
    docxPath: string,
    outputDir?: string
): Promise<string | null> {
    try {
        // 1. Read the DOCX file
        const docxBuffer = fs.readFileSync(docxPath);

        // 2. Convert DOCX → HTML via mammoth
        const { value: html } = await mammoth.convertToHtml({
            buffer: docxBuffer,
        });

        // 3. Wrap in a clean, print-ready HTML document
        const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  @page { margin: 2cm 2.5cm 2cm 3cm; size: A4; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #1a1a1a;
    margin: 0;
    padding: 0;
    background: white;
  }
  table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
  td, th { border: 1px solid #ccc; padding: 6px 10px; }
  th { background: #f5f5f5; font-weight: bold; }
  p { margin: 0 0 0.5em 0; orphans: 3; widows: 3; }
  h1 { font-size: 16pt; margin: 0.8em 0 0.4em; }
  h2 { font-size: 14pt; margin: 0.8em 0 0.4em; }
  h3 { font-size: 12pt; margin: 0.8em 0 0.4em; }
  img { max-width: 100%; height: auto; }
  ul, ol { padding-left: 2em; margin: 0.4em 0; }
  strong, b { font-weight: bold; }
  em, i { font-style: italic; }
  u { text-decoration: underline; }
</style>
</head>
<body>${html}</body>
</html>`;

        // 4. Launch headless Chrome and print to PDF
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
            ],
        });

        try {
            const page = await browser.newPage();
            await page.setContent(fullHtml, { waitUntil: "networkidle0" });

            const pdfBuffer = await page.pdf({
                format: "A4",
                printBackground: true,
                margin: { top: "2cm", right: "2.5cm", bottom: "2cm", left: "3cm" },
            });

            // 5. Write PDF to disk alongside the original DOCX
            const dir = outputDir || path.dirname(docxPath);
            const baseName = path.basename(docxPath, path.extname(docxPath));
            const pdfPath = path.join(dir, `${baseName}.pdf`);

            fs.writeFileSync(pdfPath, pdfBuffer);
            return pdfPath;
        } finally {
            await browser.close();
        }
    } catch (err) {
        console.error("[docx-to-pdf] Conversion failed:", err);
        return null;
    }
}
