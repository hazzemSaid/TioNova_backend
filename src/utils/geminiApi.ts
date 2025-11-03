import fetch from 'node-fetch';

function getApiKey(): string {
   const key = process.env.API_KEY_GEMINI;
   if (!key) {
      throw new Error('API_KEY_GEMINI is not defined in environment variables');
   }
   return key;
}

function buildPrimaryEndpoints(): string[] {
   const apiKey = getApiKey();
   const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
   return [
      `${baseUrl}/gemini-2.5-flash:generateContent?key=${apiKey}`,
      `${baseUrl}/gemini-1.5-flash:generateContent?key=${apiKey}`,
      `${baseUrl}/gemini-1.5-flash-8b:generateContent?key=${apiKey}`,
      `${baseUrl}/gemini-1.5-pro:generateContent?key=${apiKey}`,
   ];
}

let primaryEndpoints: string[] | null = null;
let lastWorkingEndpointIndex = 0;

function ensureEndpointsInitialized(): void {
   if (!primaryEndpoints) {
      primaryEndpoints = buildPrimaryEndpoints();
   }
}

export async function retryGeminiApiCall(requestBody: any, maxRetries = 2, initialDelay = 500): Promise<any> {
   let lastError;
   ensureEndpointsInitialized();
   
   if (!requestBody.generationConfig) {
      requestBody.generationConfig = {};
   }
   if (!requestBody.generationConfig.maxOutputTokens) {
      requestBody.generationConfig.maxOutputTokens = 8192;
   }
   if (!requestBody.generationConfig.temperature) {
      requestBody.generationConfig.temperature = 0.7;
   }

   const endpointsToTry = [...primaryEndpoints!];
   if (lastWorkingEndpointIndex > 0) {
      const temp = endpointsToTry[0];
      endpointsToTry[0] = endpointsToTry[lastWorkingEndpointIndex];
      endpointsToTry[lastWorkingEndpointIndex] = temp;
   }

   for (let modelAttempt = 0; modelAttempt < endpointsToTry.length; modelAttempt++) {
      const currentUrl = endpointsToTry[modelAttempt];
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
            lastWorkingEndpointIndex = primaryEndpoints!.indexOf(currentUrl);
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
            const delay = initialDelay * Math.pow(1.5, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
         }
      }
   }
   throw lastError || new Error('All Gemini API endpoints failed');
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
