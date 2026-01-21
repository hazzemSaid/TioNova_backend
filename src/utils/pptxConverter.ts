import ConvertAPI from 'convertapi';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ErrorHandler from './error';

/**
 * Convert PPTX to PDF using ConvertAPI service
 * This is a Vercel-compatible solution that doesn't require heavy dependencies
 */
export const convertPptxToPdf = async (pptxBuffer: Buffer, filename: string = 'presentation.pptx'): Promise<Buffer> => {
    const convertApiSecret = process.env.CONVERTAPI_SECRET;
    if (!convertApiSecret) {
        throw ErrorHandler.createError("PPTX conversion service is not configured. Please contact support.", 500);
    }
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `tionova-${Date.now()}-${Math.random().toString(36).slice(2)}.pptx`);

    try {
    

        await fs.writeFile(inputPath, pptxBuffer);

        const convertapi = new ConvertAPI(convertApiSecret, {
            conversionTimeout: 60,
            uploadTimeout: 60,
            downloadTimeout: 60,
            keepAlive: true
        });

        const result: any = await convertapi.convert('pdf', { File: inputPath }, 'pptx');

        const url = result?.file?.url || result?.Files?.[0]?.Url;
       

        if (!url) {
            throw ErrorHandler.createError("Conversion completed but no PDF file URL was returned", 500);
        }

        const pdfResponse = await fetch(url);
        if (!pdfResponse.ok) {
            throw ErrorHandler.createError("Failed to download converted PDF", 500);
        }

        const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
        return pdfBuffer;
    } catch (error: any) {
        console.error('PPTX conversion error:', {
            message: error?.message,
            stack: error?.stack,
            request: error?.request,
            response: error?.response
        });
        if (error.statuscode) {
            throw error;
        }
        throw ErrorHandler.createError("PowerPoint conversion service is temporarily unavailable. Please try again later.", 503);
    } finally {
        try {
            await fs.unlink(inputPath);
        } catch {}
    }
};

/**
 * Alternative: Use LibreOffice in a serverless function (requires separate deployment)
 * This would be more reliable but requires setting up a separate service
 */
export const convertPptxToPdfWithLibreOffice = async (pptxBuffer: Buffer): Promise<Buffer> => {
    // This would require a separate microservice deployment
    // For now, we'll use ConvertAPI as it's easier to set up
    throw ErrorHandler.createError("LibreOffice conversion service is not yet implemented", 501);}
