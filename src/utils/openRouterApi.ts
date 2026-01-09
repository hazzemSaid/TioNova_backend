import fetch from 'node-fetch';

interface OpenRouterMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    reasoning_details?: any;
}

interface OpenRouterRequestBody {
    model: string;
    messages: OpenRouterMessage[];
    temperature?: number;
    max_tokens?: number;
    maxOutputTokens?: number;
    generationConfig?: {
        maxOutputTokens?: number;
        temperature?: number;
        [key: string]: any;
    };
    top_p?: number;
    stream?: boolean;
    reasoning?: { enabled: boolean };
}

function getApiKey(): string {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
        throw new Error('OPENROUTER_API_KEY is not defined in environment variables');
    }
    return key;
}

/**
 * Call OpenRouter API with retry logic
 */
export async function callOpenRouterApi(
    requestBody: OpenRouterRequestBody,
    maxRetries = 2,
    initialDelay = 500
): Promise<any> {
    const apiKey = getApiKey();
    const baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

    // Set default model if not provided
    if (!requestBody.model) {
        requestBody.model = 'openrouter/auto';
    }

    // Map Gemini-style configuration if present
    if (requestBody.generationConfig) {
        if (requestBody.temperature === undefined && requestBody.generationConfig.temperature !== undefined) {
            requestBody.temperature = requestBody.generationConfig.temperature;
        }
    }

    // Set default temperature if not provided
    if (requestBody.temperature === undefined) {
        requestBody.temperature = 0.7;
    }

    // Enable reasoning if not explicitly set
    if (requestBody.reasoning === undefined) {
        requestBody.reasoning = { enabled: true };
    }

    // Map maxOutputTokens to max_tokens if provided (Gemini compatibility)
    if (requestBody.maxOutputTokens && !requestBody.max_tokens) {
        requestBody.max_tokens = requestBody.maxOutputTokens;
    } else if ((requestBody as any).generationConfig?.maxOutputTokens && !requestBody.max_tokens) {
        // Handle nested Gemini-style config
        requestBody.max_tokens = (requestBody as any).generationConfig.maxOutputTokens;
    }

    // Set default max_tokens if not provided to avoid massive default reservations
    if (!requestBody.max_tokens) {
        requestBody.max_tokens = 100000;
    }

    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            lastError = error;
            const errObj = error as any;
            const isRetryableError = errObj.message && (
                errObj.message.includes('503') ||
                errObj.message.includes('overloaded') ||
                errObj.message.includes('UNAVAILABLE') ||
                errObj.message.includes('RESOURCE_EXHAUSTED') ||
                errObj.message.includes('429') ||
                errObj.message.includes('rate limit')
            );

            if (attempt === maxRetries || !isRetryableError) {
                break;
            }

            const delay = initialDelay * Math.pow(1.5, attempt - 1);
            console.log(`⚠️ OpenRouter API call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError || new Error('OpenRouter API call failed after all retries');
}

/**
 * Helper function to extract text content from OpenRouter API response
 * Handles both regular content and reasoning models (like DeepSeek R1)
 */
export function extractOpenRouterText(response: any): string {
    if (!response) {
        console.error("OpenRouter response is null or undefined");
        return '';
    }
    
    if (!response.choices || response.choices.length === 0) {
        console.error("OpenRouter response missing choices:", JSON.stringify(response, null, 2));
        return '';
    }
    
    const message = response.choices[0].message;
    if (!message) {
        console.error("OpenRouter response missing message:", JSON.stringify(response.choices[0], null, 2));
        return '';
    }
    
    // First try to get content from the standard content field
    if (message.content && message.content.trim().length > 0) {
        return message.content;
    }
    
    // For reasoning models (like DeepSeek R1), content might be in the reasoning field
    if (message.reasoning && message.reasoning.trim().length > 0) {
        console.log("Using reasoning field instead of content field");
        return message.reasoning;
    }
    
    // Also check reasoning_details array if available
    if (message.reasoning_details && Array.isArray(message.reasoning_details) && message.reasoning_details.length > 0) {
        const reasoningText = message.reasoning_details[0]?.text;
        if (reasoningText && reasoningText.trim().length > 0) {
            console.log("Using reasoning_details[0].text instead of content field");
            return reasoningText;
        }
    }
    
    console.error("OpenRouter response has no content in any field:", JSON.stringify(message, null, 2));
    return '';
}
/**
 * Helper function to parse JSON from OpenRouter response
 * Handles markdown code fences and attempts repair if needed
 */
export function parseOpenRouterJson(rawText: string): any {
    // Clean up markdown code fences if present
    let cleanText = rawText.trim();
    if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/```\s*/, '').replace(/```\s*$/, '');
    }

    try {
        return JSON.parse(cleanText);
    } catch (error) {
        // Try to repair JSON
        try {
            const { jsonrepair } = require('jsonrepair');
            return JSON.parse(jsonrepair(cleanText));
        } catch (repairError) {
            throw new Error(`Failed to parse JSON from response: ${error}`);
        }
    }
}
