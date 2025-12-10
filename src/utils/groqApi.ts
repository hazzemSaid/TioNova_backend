import fetch from 'node-fetch';

interface GroqMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface GroqRequestBody {
    model?: string;
    messages: GroqMessage[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    stream?: boolean;
}

function getApiKey(): string {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
        throw new Error('GROQ_API_KEY is not defined in environment variables');
    }
    return key;
}

/**
 * Call Groq API with retry logic for content generation (summaries, quizzes, mindmaps)
 */
export async function callGroqApi(
    requestBody: GroqRequestBody,
    maxRetries = 2,
    initialDelay = 500
): Promise<any> {
    const apiKey = getApiKey();
    const baseUrl = 'https://api.groq.com/openai/v1/chat/completions';

    // Set default model if not provided
    if (!requestBody.model) {
        requestBody.model = 'openai/gpt-oss-120b'; // OpenAI GPT OSS 120B model for quiz generation
    }

    // Set default temperature if not provided
    if (requestBody.temperature === undefined) {
        requestBody.temperature = 0.7;
    }

    // Set default max_tokens if not provided
    if (!requestBody.max_tokens) {
        requestBody.max_tokens = 8192;
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
                throw new Error(`Groq API error: ${response.status} - ${errorText}`);
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
            console.log(`⚠️ Groq API call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError || new Error('Groq API call failed after all retries');
}

/**
 * Helper function to extract text content from Groq API response
 */
export function extractGroqText(response: any): string {
    if (!response || !response.choices || response.choices.length === 0) {
        throw new Error('Invalid Groq API response: no choices found');
    }

    const text = response.choices[0]?.message?.content;
    if (!text) {
        throw new Error('Invalid Groq API response: no content found');
    }

    return text.trim();
}

/**
 * Helper function to parse JSON from Groq response
 * Handles markdown code fences and attempts repair if needed
 */
export function parseGroqJson(rawText: string): any {
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
            throw new Error(`Failed to parse JSON from Groq response: ${error}`);
        }
    }
}
