import fetch from 'node-fetch';

const API_KEY_GEMINI = process.env.API_KEY_GEMINI || '';

// Build a robust list of candidate endpoints across API versions and model id variants.
function buildStaticCandidateEndpoints(): string[] {
	// Prefer v1beta which commonly supports generateContent for 1.5 models
	const apiVersions = ['v1beta', 'v1'];
	const modelIds = [
		'gemini-1.5-flash',
		'gemini-1.5-flash-001',
		'gemini-1.5-flash-002',
		'gemini-1.5-flash-8b',
		'gemini-1.5-pro',
		'gemini-1.5-pro-001',
		'gemini-1.5-pro-002',
		'gemini-pro',
		'gemini-1.0-pro',
		'gemini-1.5-flash-latest',
		'gemini-1.5-pro-latest',
	];
	const urls: string[] = [];
	for (const ver of apiVersions) {
		for (const model of modelIds) {
			urls.push(`https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${API_KEY_GEMINI}`);
		}
	}
	return urls;
}

let candidateEndpoints: string[] = buildStaticCandidateEndpoints();

async function refreshCandidateEndpointsFromListModels(): Promise<void> {
	const discovered: string[] = [];
	// Prefer v1beta, then v1
	const versionsToTry = ['v1beta', 'v1'];
	for (const ver of versionsToTry) {
		try {
			const listUrl = `https://generativelanguage.googleapis.com/${ver}/models?key=${API_KEY_GEMINI}`;
			const res = await fetch(listUrl);
			if (!res.ok) {
				continue;
			}
			const json = await res.json();
			const models: any[] = Array.isArray(json?.models) ? json.models : [];
			for (const m of models) {
				const name: string = m?.name || '';
				// Prefer 1.5 family and ensure generateContent is supported if field exists
				const isDesired = name.includes('gemini-1.5') || name.includes('gemini-pro') || name.includes('gemini-1.0-pro');
				const methods: string[] = Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
				const supportsGenerate = methods.length === 0 || methods.includes('generateContent');
				if (name.startsWith('models/') && isDesired && supportsGenerate) {
					discovered.push(`https://generativelanguage.googleapis.com/${ver}/${name}:generateContent?key=${API_KEY_GEMINI}`);
				}
			}
		} catch {}
	}
	if (discovered.length > 0) {
		candidateEndpoints = discovered;
	} else {
		// No models discovered; log what the API returned for troubleshooting
		try {
			for (const ver of versionsToTry) {
				const listUrl = `https://generativelanguage.googleapis.com/${ver}/models?key=${API_KEY_GEMINI}`;
				const res = await fetch(listUrl);
				const json = await res.json();
				// Intentionally log minimal but informative output
				console.warn(`[Gemini] ListModels (${ver}) returned models summary:`, Array.isArray(json?.models) ? json.models.map((m: any) => m?.name) : json);
			}
		} catch {}
	}
}

let currentModelIndex = 0;

export async function retryGeminiApiCall(requestBody: any, maxRetries = 3, initialDelay = 1000): Promise<any> {
	let lastError;
	// Try to refresh the endpoint list once before attempting calls
	try { await refreshCandidateEndpointsFromListModels(); } catch {}
	for (let modelAttempt = 0; modelAttempt < candidateEndpoints.length; modelAttempt++) {
		const currentUrl = candidateEndpoints[(currentModelIndex + modelAttempt) % candidateEndpoints.length];
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
				currentModelIndex = (currentModelIndex + modelAttempt) % candidateEndpoints.length;
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
				// If we got a NOT_FOUND for this URL, try to refresh model list once
				const isNotFound = errObj.message && (errObj.message.includes('404') || errObj.message.includes('NOT_FOUND'));
				if (isNotFound && attempt === 1 && modelAttempt === 0) {
					try { await refreshCandidateEndpointsFromListModels(); } catch {}
				}
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
