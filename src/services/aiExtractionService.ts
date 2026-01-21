import ErrorHandler from "../utils/error";
import { retryGeminiApiCall } from "../utils/geminiApi";

export const extractContentFromDocument = async (
	buffer: Buffer,
	mimeType: string,
	isPowerPoint: boolean
): Promise<string> => {
	const base64 = buffer.toString("base64");
	const documentType = isPowerPoint ? "PowerPoint presentations" : "PDFs";

	const requestBody = {
		contents: [{
			parts: [
				{
					text: `You are an expert at extracting educational content from ${documentType}.

YOUR GOAL: Convert the ${isPowerPoint ? 'PowerPoint' : 'PDF'} into a detailed, structured Markdown format optimized for learning.

EXTRACTION RULES:
1. NO SUMMARIZING - Capture all actual knowledge, facts, and explanations.
2. FULL DETAIL - Include deep explanations, examples, formulas, and technical data.
3. SMART STRUCTURE:
   - Use # for Chapters, ## for Sections, ### for Subsections.
   - Use **Bold** for key concepts and definitions.
   - Use bullet points for lists.
   - Preserve code block formatting.
4. HANDLE QUESTIONS - If the document has review questions, extract them exactly as: "[Existing Question]: <text>".
5. ${isPowerPoint ? 'SLIDE CONTENT - Extract each slide\'s title and content. Avoid inserting separators like \"---\". Use compact markdown without excessive blank lines or spacing.' : 'CLEANUP - Remove all headers, footers, page numbers, and non-educational noise.'}
6. FORMATTING HYGIENE:
   - Avoid extra spaces after list markers; use \"* item\" or \"- item\".
   - Avoid more than one blank line; keep content compact.
   - Do not add artificial separators or decorative lines.

OUTPUT: Comprehensive Markdown string representing the full knowledge of the document.` },
				{ inlineData: { mimeType: mimeType, data: base64 } }
			]
		}],
		generationConfig: { temperature: 0.5, maxOutputTokens: 16384 },
	};

	let response;
	try {
		response = await retryGeminiApiCall(requestBody);
	} catch (geminiError: any) {
		console.error("Gemini API call failed:", geminiError);
		throw ErrorHandler.createError("Server is busy. Please try again later.", 503);
	}

	const data = await response.json();
	const extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

	if (!extractedText) {
		console.error("Gemini API returned no extracted text:", JSON.stringify(data, null, 2));
		throw ErrorHandler.createError("Server is busy. Please try again later.", 503);
	}

	return extractedText;
};
