/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: User profile and preferences management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Profile:
 *       type: object
 *       properties:
 *         username:
 *           type: string
 *         email:
 *           type: string
 *         profilePicture:
 *           type: string
 *         universityCollege:
 *           type: string
 *         role:
 *           type: string
 *         streak:
 *           type: integer
 *         totalQuizzesTaken:
 *           type: integer
 *         totalMindmapsCreated:
 *           type: integer
 *         totalSummariesCreated:
 *           type: integer
 *         averageQuizScore:
 *           type: number
 *         memberSince:
 *           type: string
 *           format: date-time
 *         totalChapters:
 *           type: integer
 *     Preferences:
 *       type: object
 *       properties:
 *         studyPerDay:
 *           type: integer
 *           description: Target number of chapters to study per day
 *         preferredStudyTimes:
 *           type: array
 *           items:
 *             type: string
 *           description: e.g. ["Morning", "Evening"]
 *         dailyTimeCommitmentMinutes:
 *           type: integer
 *         daysPerWeek:
 *           type: integer
 *         goals:
 *           type: array
 *           items:
 *             type: string
 *         reminderEnabled:
 *           type: boolean
 *         reminderTimes:
 *           type: array
 *           items:
 *             type: string
 *         contentDifficulty:
 *           type: string
 *           enum: [easy, medium, hard]
 */

/**
 * @swagger
 * /profile:
 *   get:
 *     summary: Get authenticated user's profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Profile'
 *   put:
 *     summary: Update user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               universityCollege:
 *                 type: string
 *               profilePicture:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile updated successfully
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
 *                   example: Profile updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Profile'
 *       400:
 *         description: Invalid input or file size too large
 *       409:
 *         description: Username already exists
 */

/**
 * @swagger
 * /profile/preferences:
 *   get:
 *     summary: Get user preferences
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Preferences'
 *       404:
 *         description: Preferences not found
 *   patch:
 *     summary: Update user preferences
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Preferences'
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Preferences'
 *       400:
 *         description: Validation error
 */

/**
 * @swagger
 * /profile/{userId}:
 *   get:
 *     summary: Get public profile of a user
 *     tags: [Profile]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user
 *     responses:
 *       200:
 *         description: Public profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     username:
 *                       type: string
 *                     profilePicture:
 *                       type: string
 *                     universityCollege:
 *                       type: string
 *                     streak:
 *                       type: integer
 *                     totalQuizzesTaken:
 *                       type: integer
 *                     totalMindmapsCreated:
 *                       type: integer
 *                     totalSummariesCreated:
 *                       type: integer
 *                     averageQuizScore:
 *                       type: number
 *       404:
 *         description: User not found
 */
