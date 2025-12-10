/**
 * @swagger
 * tags:
 *   name: Share
 *   description: Sharing functionality
 */

/**
 * @swagger
 * /getAvailableUsersForShare:
 *   post:
 *     summary: Search users to share content with
 *     tags: [Share]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: Username or email to search
 *             required:
 *               - query
 *     responses:
 *       200:
 *         description: Users found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       email:
 *                         type: string
 *                       profilePicture:
 *                         type: string
 */

/**
 * @swagger
 * /setuserssharewith:
 *   post:
 *     summary: Share a folder with users
 *     tags: [Share]
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
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: IDs of users to share with
 *             required:
 *               - folderId
 *               - userIds
 *     responses:
 *       200:
 *         description: Folder shared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
