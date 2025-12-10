/**
 * @swagger
 * tags:
 *   name: Summary
 *   description: AI-generated summaries for chapters
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Summary:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         title:
 *           type: string
 *         summary:
 *           type: string
 *           description: The Markdown content of the summary
 *         chapterId:
 *           type: string
 *         keyPoints:
 *           type: array
 *           items:
 *             type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /summarizecchapter:
 *   post:
 *     summary: Generate or retrieve summary for a chapter
 *     tags: [Summary]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chapterId:
 *                 type: string
 *             required:
 *               - chapterId
 *     responses:
 *       200:
 *         description: Summary generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 summary:
 *                   $ref: '#/components/schemas/Summary'
 *                 cached:
 *                   type: boolean
 *       404:
 *         description: Chapter not found
 */

/**
 * @swagger
 * /getChapterSummary/{chapterId}:
 *   get:
 *     summary: Get existing summary for a chapter
 *     tags: [Summary]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Summary retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 summary:
 *                   $ref: '#/components/schemas/Summary'
 */
