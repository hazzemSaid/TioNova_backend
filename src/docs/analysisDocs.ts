/**
 * @swagger
 * tags:
 *   name: Analysis
 *   description: User progress and activity analysis
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AnalysisData:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *         recentChapters:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Chapter'
 *         recentFolders:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Folder'
 *         lastMindmaps:
 *           type: array
 *           items:
 *             type: object
 *             description: Mindmap object
 *         lastSummary:
 *           type: object
 *           description: Summary object
 *         lastRank:
 *           type: integer
 *         totalChapters:
 *           type: integer
 *         avgScore:
 *           type: number
 *         profile:
 *           type: object
 *           properties:
 *             streak:
 *               type: integer
 *             totalQuizzesTaken:
 *               type: integer
 *             averageQuizScore:
 *               type: number
 *         todayProgress:
 *           type: object
 *           properties:
 *             current:
 *               type: integer
 *               description: Chapters studied today
 *             target:
 *               type: integer
 *               description: Daily target
 *             percentage:
 *               type: integer
 *               description: Progress percentage
 */

/**
 * @swagger
 * /analysis:
 *   get:
 *     summary: Get comprehensive analysis data for the authenticated user
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analysis data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/AnalysisData'
 *       500:
 *         description: Server error
 */
