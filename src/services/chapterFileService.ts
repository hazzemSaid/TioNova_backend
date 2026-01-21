import { IUploadFile } from "../interfaces/IUploadFile";
import ErrorHandler from "../utils/error";
import { convertPptxToPdf } from "../utils/pptxConverter";

export interface ProcessedFile {
	buffer: Buffer;
	mimeType: string;
	isPowerPoint: boolean;
}

export const processChapterFile = async (
	file: IUploadFile,
	userId: string,
	updateProgress?: (progress: number, message: string) => Promise<void>,
	failJob?: (message: string) => Promise<void>
): Promise<ProcessedFile> => {
	const isPowerPoint = file.mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation";

	let processingBuffer = file.buffer;
	let processingMimeType = file.mimetype;

	if (isPowerPoint) {
		console.log("[ChapterFileService] PPTX detected, starting conversion");
		if (updateProgress) await updateProgress(10, "Converting PowerPoint to PDF");

		try {
			processingBuffer = await convertPptxToPdf(file.buffer, 'presentation.pptx');
			processingMimeType = "application/pdf";

			console.log("[ChapterFileService] PPTX conversion complete");
			if (updateProgress) await updateProgress(30, "PowerPoint conversion completed");
		} catch (conversionError: any) {
			console.error("PPTX conversion failed:", conversionError);
			if (failJob) await failJob("Failed to convert PowerPoint file. Please try a PDF file instead.");
			throw ErrorHandler.createError("PowerPoint conversion failed. Please try a PDF file or contact support.", 400);
		}
	}

	return {
		buffer: processingBuffer,
		mimeType: processingMimeType,
		isPowerPoint
	};
};
