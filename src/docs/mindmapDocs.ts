/**
 * @swagger
 * tags:
 *   name: Mindmap
 *   description: Mindmap generation and management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     MindmapNode:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         label:
 *           type: string
 *         type:
 *           type: string
 *           enum: [root, main, sub]
 *     MindmapEdge:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         source:
 *           type: string
 *         target:
 *           type: string
 *     Mindmap:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         userId:
 *           type: string
 *         chapterId:
 *           type: string
 *         nodes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/MindmapNode'
 *         edges:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/MindmapEdge'
 */

/**
 * @swagger
 * /createMindmap:
 *   post:
 *     summary: Create or generate a mindmap for a chapter
 *     tags: [Mindmap]
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
 *         description: Mindmap created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 mindmap:
 *                   $ref: '#/components/schemas/Mindmap'
 */

/**
 * @swagger
 * /saveMindmap:
 *   patch:
 *     summary: Save changes to a mindmap
 *     tags: [Mindmap]
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
 *               nodes:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/MindmapNode'
 *               edges:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/MindmapEdge'
 *             required:
 *               - chapterId
 *               - nodes
 *               - edges
 *     responses:
 *       200:
 *         description: Mindmap saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 updatedMindmap:
 *                   $ref: '#/components/schemas/Mindmap'
 */

/**
 * @swagger
 * /generateText:
 *   post:
 *     summary: Generate text content for a mindmap node using AI
 *     tags: [Mindmap]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nodeLabel:
 *                 type: string
 *               context:
 *                 type: string
 *             required:
 *               - nodeLabel
 *     responses:
 *       200:
 *         description: Content generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 content:
 *                   type: string
 */

/**
 * @swagger
 * /getMindmap/{chapterId}:
 *   get:
 *     summary: Get mindmap by chapter ID
 *     tags: [Mindmap]
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
 *         description: Mindmap retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 mindmap:
 *                   $ref: '#/components/schemas/Mindmap'
 */
