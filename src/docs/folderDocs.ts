/**
 * @swagger
 * tags:
 *   name: Folder
 *   description: Folder management operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Folder:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Folder ID
 *         name:
 *           type: string
 *           description: Folder name
 *         description:
 *           type: string
 *           description: Folder description
 *         ownerId:
 *           type: string
 *           description: ID of the folder owner
 *         sharedWith:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [viewer, editor]
 *         isPublic:
 *           type: boolean
 *           description: Public visibility status
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /createfolder:
 *   post:
 *     summary: Create a new folder
 *     tags: [Folder]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *               sharedWith:
 *                 type: array
 *                 items:
 *                   type: string
 *             required:
 *               - name
 *     responses:
 *       200:
 *         description: Folder created successfully
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
 *                   example: Folder created successfully
 *                 folder:
 *                   $ref: '#/components/schemas/Folder'
 *       400:
 *         description: Validation error
 */

/**
 * @swagger
 * /updatefolder:
 *   patch:
 *     summary: Update a folder
 *     tags: [Folder]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               folderId:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *               sharedWith:
 *                 type: array
 *                 items:
 *                   type: string
 *             required:
 *               - folderId
 *     responses:
 *       200:
 *         description: Folder updated successfully
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
 *                   example: Folder updated successfully
 *                 folder:
 *                   $ref: '#/components/schemas/Folder'
 *       404:
 *         description: Folder not found
 */

/**
 * @swagger
 * /getfolders:
 *   get:
 *     summary: Get all folders for the user
 *     tags: [Folder]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Folders retrieved successfully
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
 *                   example: Folders retrieved successfully
 *                 folders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Folder'
 *                 cached:
 *                   type: boolean
 */

/**
 * @swagger
 * /getpublicfolders:
 *   get:
 *     summary: Get all public folders
 *     tags: [Folder]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Public folders retrieved successfully
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
 *                   example: Public folders retrieved successfully
 *                 folders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Folder'
 *                 cached:
 *                   type: boolean
 */

/**
 * @swagger
 * /deletefolder/{folderId}:
 *   delete:
 *     summary: Delete a folder
 *     tags: [Folder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the folder to delete
 *     responses:
 *       200:
 *         description: Folder deleted successfully
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
 *                   example: Folder deleted successfully
 *       404:
 *         description: Folder not found
 */
