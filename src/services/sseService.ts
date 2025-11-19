/**
 * Helper to send progress event to user
 */
export function sendProgressEvent(userId: string, progress: number, message: string, extra?: Record<string, any>) {
  const event = { progress, message, ...extra };
  sendEventToUser(userId, event);
}
// sseService.ts

export type SendEventToUser = (userId: string, event: Record<string, any>) => void;

/**
 * Default implementation placeholder. Replace with actual SSE logic.
 */
export const sendEventToUser: SendEventToUser = (userId, event) => {
  // Implement SSE logic here, e.g., push to a socket, event stream, etc.
  // Example:
  // SSEManager.send(userId, event);
  // For now, just log:
  console.log(`SSE to user ${userId}:`, event);
};
