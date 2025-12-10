/**
 * @swagger
 * tags:
 *   name: System
 *   description: System status and real-time events
 */

/**
 * @swagger
 * /:
 *   get:
 *     summary: API Root / Welcome
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 message:
 *                   type: string
 *                   example: TioNova Backend Server is running
 */

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 service:
 *                   type: string
 *                   example: TioNova API
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */

/**
 * @swagger
 * /sse/subscribe:
 *   get:
 *     summary: Subscribe to Server-Sent Events (SSE)
 *     tags: [System]
 *     description: |
 *       Connects to the SSE stream for real-time updates.
 *       Requires `userId` as a query parameter.
 *       Response content-type is `text/event-stream`.
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user connecting
 *     responses:
 *       200:
 *         description: Connection established
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: "data: {\"message\": \"connected\", \"userId\": \"123\"}\n\n"
 */
