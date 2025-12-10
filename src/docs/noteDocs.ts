/**
 * @swagger
 * tags:
 *   name: Note
 *   description: User notes (text, image, voice)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Note:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         userId:
 *           type: string
 *         chapterId:
 *           type: string
 *         type:
 *           type: string
 *           enum: [text, image, voice]
 *         content:
 *           type: string
 *         mediaUrl:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /notes/chapter/{chapterId}:
 *   get:
 *     summary: Get all notes for a chapter
 *     tags: [Note]
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
 *         description: Notes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Note'
 */

/**
 * @swagger
 * /notes/text:
 *   post:
 *     summary: Add a text note
 *     tags: [Note]
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
 *               content:
 *                 type: string
 *             required:
 *               - chapterId
 *               - content
 *     responses:
 *       201:
 *         description: Note created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Note'
 */

/**
 * @swagger
 * /notes/image:
 *   post:
 *     summary: Add an image note
 *     tags: [Note]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               chapterId:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *             required:
 *               - chapterId
 *               - file
 *     responses:
 *       201:
 *         description: Image note created
 */

/**
 * @swagger
 * /notes/voice:
 *   post:
 *     summary: Add a voice note
 *     tags: [Note]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               chapterId:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *             required:
 *               - chapterId
 *               - file
 *     responses:
 *       201:
 *         description: Voice note created
 */

/**
 * @swagger
 * /notes/{noteId}:
 *   patch:
 *     summary: Update a note
 *     tags: [Note]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Note updated
 *   delete:
 *     summary: Delete a note
 *     tags: [Note]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Note deleted
 */
