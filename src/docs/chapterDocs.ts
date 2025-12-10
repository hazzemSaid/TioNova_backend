/**
 * @swagger
 * tags:
 *   name: Chapter
 *   description: Chapter management and content extraction
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Chapter:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Chapter ID
 *         title:
 *           type: string
 *           description: Chapter title
 *         description:
 *           type: string
 *           description: Chapter description
 *         folderId:
 *           type: string
 *           description: ID of the folder containing the chapter
 *         content:
 *           type: string
 *           description: Extracted text content of the chapter
 *         contentType:
 *           type: string
 *           enum: [application/pdf, text/plain, video/youtube, url/web]
 *           description: Type of the content
 *         sourceUrl:
 *           type: string
 *           description: Source URL for YouTube videos or web pages
 *         fileUrl:
 *           type: string
 *           description: URL of the uploaded file (if applicable)
 *         youtubeId:
 *           type: string
 *           description: YouTube Video ID (if applicable)
 *         createdBy:
 *           type: string
 *           description: ID of the user who created the chapter
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 */

/**
 * @swagger
 * /createchapter:
 *   post:
 *     summary: Create a new chapter
 *     description: Upload a file (PDF) or provide a URL/Text to create a chapter and extract content.
 *     tags: [Chapter]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               folderId:
 *                 type: string
 *               contentType:
 *                 type: string
 *                 enum: [application/pdf, text/plain, video/youtube, url/web]
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Required if contentType is application/pdf
 *               content:
 *                 type: string
 *                 description: Required if contentType is text/plain
 *               sourceUrl:
 *                 type: string
 *                 description: Required if contentType is video/youtube or url/web
 *             required:
 *               - title
 *               - folderId
 *               - contentType
 *     responses:
 *       200:
 *         description: Chapter created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chapter created successfully with content extraction
 *                 chapter:
 *                   $ref: '#/components/schemas/Chapter'
 *       400:
 *         description: Invalid input or unsupported content type
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /getchapters/{folderId}:
 *   get:
 *     summary: Get all chapters in a folder
 *     tags: [Chapter]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the folder
 *     responses:
 *       200:
 *         description: List of chapters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chapters retrieved successfully
 *                 chapters:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Chapter'
 *       404:
 *         description: Folder not found
 */

/**
 * @swagger
 * /getchaptercontent/{chapterId}:
 *   get:
 *     summary: Get content of a specific chapter
 *     tags: [Chapter]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the chapter
 *     responses:
 *       200:
 *         description: Chapter content retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chapter content retrieved successfully
 *                 content:
 *                   type: string
 *                   description: The full text content of the chapter
 *                 contentType:
 *                   type: string
 *                 cached:
 *                   type: boolean
 *       404:
 *         description: Chapter not found
 */

/**
 * @swagger
 * /updatechapter/{chapterId}:
 *   patch:
 *     summary: Update a chapter
 *     tags: [Chapter]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the chapter
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chapter updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chapter updated successfully
 *       404:
 *         description: Chapter not found
 */

/**
 * @swagger
 * /deletechapter/{chapterId}:
 *   delete:
 *     summary: Delete a chapter
 *     tags: [Chapter]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the chapter
 *     responses:
 *       200:
 *         description: Chapter deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chapter deleted successfully
 *       404:
 *         description: Chapter not found
 */
