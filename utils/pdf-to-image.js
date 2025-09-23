// utils/pdf-to-image.js - REWRITTEN WITH PDF-POPPLER

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { Poppler } = require('pdf-poppler');

module.exports = async function pdfToImageBuffer(pdfBuffer) {
    const tempDir = os.tmpdir();
    // Create a unique filename to avoid conflicts
    const tempPdfPath = path.join(tempDir, `upload_${Date.now()}.pdf`);
    const outputPrefix = path.join(tempDir, `output_${Date.now()}`);
    let imageBuffer = null;

    try {
        // 1. Write the PDF buffer to a temporary file
        await fs.writeFile(tempPdfPath, pdfBuffer);

        const poppler = new Poppler();
        const options = {
            firstPageToConvert: 1,
            lastPageToConvert: 1,
            pngFile: true, // We want a PNG image
        };
        
        // 2. Convert the PDF file to an image file
        await poppler.pdfToCairo(tempPdfPath, outputPrefix, options);
        
        // The output file will be named like 'output_12345-1.png'
        const outputImagePath = `${outputPrefix}-1.png`;

        // 3. Read the generated image file back into a buffer
        imageBuffer = await fs.readFile(outputImagePath);

        // 4. Clean up the temporary files
        await fs.unlink(tempPdfPath);
        await fs.unlink(outputImagePath);

        return imageBuffer; // Return the raw image buffer

    } catch (err) {
        console.error("ERROR: PDF to Image conversion failed:", err);
        
        // Attempt to clean up files even if there was an error
        try {
            await fs.unlink(tempPdfPath);
            const potentialImagePath = `${outputPrefix}-1.png`;
            // Check if the image file exists before trying to delete it
            if (await fs.stat(potentialImagePath).catch(() => false)) {
                 await fs.unlink(potentialImagePath);
            }
        } catch (cleanupErr) {
            console.error("Error during cleanup:", cleanupErr);
        }
        
        return null;
    }
};