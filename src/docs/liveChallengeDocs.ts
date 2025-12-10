/**
 * @swagger
 * tags:
 *   name: LiveChallenge
 *   description: Real-time multiplayer challenges
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     LiveChallenge:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         code:
 *           type: string
 *           description: 6-digit join code
 *         status:
 *           type: string
 *           enum: [waiting, active, completed]
 *         participants:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               score:
 *                 type: integer
 */

/**
 * @swagger
 * /live/challenges:
 *   post:
 *     summary: Create a live challenge lobby
 *     tags: [LiveChallenge]
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
 *         description: Challenge created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 code:
 *                   type: string
 *                   description: The join code
 *                 qrCode:
 *                   type: string
 *                   description: Base64 QR code image
 *                 challengeId:
 *                   type: string
 */

/**
 * @swagger
 * /live/challenges/join:
 *   post:
 *     summary: Join a live challenge
 *     tags: [LiveChallenge]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: Join code
 *             required:
 *               - code
 *     responses:
 *       200:
 *         description: Joined successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 challenge:
 *                   $ref: '#/components/schemas/LiveChallenge'
 */

/**
 * @swagger
 * /live/challenges/start:
 *   post:
 *     summary: Start the challenge (Owner only)
 *     tags: [LiveChallenge]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               challengeId:
 *                 type: string
 *             required:
 *               - challengeId
 *     responses:
 *       200:
 *         description: Challenge started
 */

/**
 * @swagger
 * /live/challenges/answer:
 *   post:
 *     summary: Submit answer during challenge
 *     tags: [LiveChallenge]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               challengeId:
 *                 type: string
 *               answer:
 *                 type: string
 *               timeRemaining:
 *                 type: integer
 *             required:
 *               - challengeId
 *               - answer
 *     responses:
 *       200:
 *         description: Answer submitted
 */

/**
 * @swagger
 * /live/challenges/disconnect:
 *   post:
 *     summary: Leave the challenge
 *     tags: [LiveChallenge]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               challengeId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Disconnected successfully
 */

/**
 * @swagger
 * /live/challenges/advance:
 *   post:
 *     summary: Advance to next question (Owner only)
 *     tags: [LiveChallenge]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               challengeId:
 *                 type: string
 *             required:
 *               - challengeId
 *     responses:
 *       200:
 *         description: Advanced successfully
 */

/**
 * @swagger
 * /live/challenges/check-advance:
 *   post:
 *     summary: Check if challenge should auto-advance
 *     tags: [LiveChallenge]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               challengeId:
 *                 type: string
 *             required:
 *               - challengeId
 *     responses:
 *       200:
 *         description: Check completed
 */
