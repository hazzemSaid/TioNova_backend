/**
 * @swagger
 * tags:
 *   name: Quiz
 *   description: Quiz generation and management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Question:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         question:
 *           type: string
 *         options:
 *           type: array
 *           items:
 *             type: string
 *     Quiz:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         title:
 *           type: string
 *         questions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Question'
 *     QuizResult:
 *       type: object
 *       properties:
 *         totalQuestions:
 *           type: integer
 *         correct:
 *           type: integer
 *         score:
 *           type: integer
 *         status:
 *           type: string
 *           enum: [Passed, Failed]
 *     QuizHistory:
 *       type: object
 *       properties:
 *         attempts:
 *           type: array
 *           items:
 *             type: object
 *         overallScore:
 *           type: number
 *         bestScore:
 *           type: number
 *         averageScore:
 *           type: number
 */

/**
 * @swagger
 * /createquiz:
 *   post:
 *     summary: Generate or retrieve a quiz for a chapter
 *     tags: [Quiz]
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
 *         description: Quiz retrieved or generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 quiz:
 *                   $ref: '#/components/schemas/Quiz'
 *       404:
 *         description: Chapter not found
 */

/**
 * @swagger
 * /getchapterquiz/{chapterId}:
 *   get:
 *     summary: Get existing quiz for a chapter
 *     tags: [Quiz]
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
 *         description: Quiz retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 quiz:
 *                   $ref: '#/components/schemas/Quiz'
 */

/**
 * @swagger
 * /getQuizQuestions/{quizId}:
 *   get:
 *     summary: Get all questions for a quiz
 *     tags: [Quiz]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Questions retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 questions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Question'
 */

/**
 * @swagger
 * /setuserquizstatus:
 *   post:
 *     summary: Submit quiz answers and get results
 *     tags: [Quiz]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quizId:
 *                 type: string
 *               chapterId:
 *                 type: string
 *               timeTaken:
 *                 type: integer
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     questionId:
 *                       type: string
 *                     answer:
 *                       type: string
 *             required:
 *               - quizId
 *               - chapterId
 *               - answers
 *     responses:
 *       200:
 *         description: Quiz graded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 result:
 *                   $ref: '#/components/schemas/QuizResult'
 */

/**
 * @swagger
 * /quizhistory:
 *   post:
 *     summary: Get quiz history for a chapter
 *     tags: [Quiz]
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
 *         description: History retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 history:
 *                   $ref: '#/components/schemas/QuizHistory'
 */

/**
 * @swagger
 * /practicemode:
 *   post:
 *     summary: Start practice mode (questions with answers)
 *     tags: [Quiz]
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
 *         description: Practice quiz retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 quiz:
 *                   $ref: '#/components/schemas/Quiz'
 */
