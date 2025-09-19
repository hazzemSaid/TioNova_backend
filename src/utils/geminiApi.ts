import fetch from 'node-fetch';

const API_KEY_GEMINI = process.env.API_KEY_GEMINI || '';
const GEMINI_MODELS = [
	`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY_GEMINI}`,
	`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY_GEMINI}`,
	`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY_GEMINI}`
];
let currentModelIndex = 0;

export async function retryGeminiApiCall(requestBody: any, maxRetries = 3, initialDelay = 1000): Promise<any> {
	let lastError;
	for (let modelAttempt = 0; modelAttempt < GEMINI_MODELS.length; modelAttempt++) {
		const currentUrl = GEMINI_MODELS[(currentModelIndex + modelAttempt) % GEMINI_MODELS.length];
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const response = await fetch(currentUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(requestBody)
				});
				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
				}
				currentModelIndex = (currentModelIndex + modelAttempt) % GEMINI_MODELS.length;
				return response;
			} catch (error) {
				lastError = error;
				const errObj = error as any;
				const isRetryableError = errObj.message && (
					errObj.message.includes('503') ||
					errObj.message.includes('overloaded') ||
					errObj.message.includes('UNAVAILABLE') ||
					errObj.message.includes('RESOURCE_EXHAUSTED') ||
					errObj.message.includes('429')
				);
				if (attempt === maxRetries || !isRetryableError) {
					break;
				}
				const delay = initialDelay * Math.pow(2, attempt - 1);
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
	}
	throw lastError;
}

export function getMimeType(filename: string, detectedMimeType?: string): string {
	const ext = filename.split('.').pop()?.toLowerCase() || '';
	const mimeTypes: { [key: string]: string } = {
		'pdf': 'application/pdf',
		'jpg': 'image/jpeg',
		'jpeg': 'image/jpeg',
		'png': 'image/png',
		'gif': 'image/gif',
		'txt': 'text/plain',
		'csv': 'text/csv',
		'json': 'application/json',
		'mp4': 'video/mp4',
		'mov': 'video/quicktime'
	};
	return detectedMimeType || mimeTypes[ext] || 'application/octet-stream';
}
