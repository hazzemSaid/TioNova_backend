
/**
 * Ensures the content is returned as a Buffer.
 * Handles cases where content might be a MongoDB Binary object or already a Buffer.
 */
export const ensureBuffer = (content: any): Buffer | null => {
	if (!content) return null;

	if (Buffer.isBuffer(content)) {
		return content;
	}

	if (content.buffer && Buffer.isBuffer(content.buffer)) {
		return Buffer.from(content.buffer);
	}

	try {
		return Buffer.from(content);
	} catch (e) {
		console.error("[BufferUtils] Failed to convert content to buffer", e);
		return null;
	}
};
