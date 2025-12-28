import mongoose, { isValidObjectId } from 'mongoose';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import ChallengeResultModel from '../models/ChallengeResultModel';
import ChapterModel from '../models/ChapterModel';
import QuestionModel from '../models/QuestionModel';
import QuizModel from '../models/QuizModel';
import ErrorHandler from '../utils/error';
import { admin } from '../utils/firebase';
import { getMimeType, retryGeminiApiCall } from '../utils/geminiApi';
import { callOpenRouterApi, extractOpenRouterText, parseOpenRouterJson } from '../utils/openRouterApi';
import { ProfileService } from './profileService';

const db = admin.database();

// Constants
const QUESTION_DURATION = 30000; // 30 seconds

// Types for service responses
export interface ServiceResult<T = any> {
	success: boolean;
	statusCode: number;
	data?: T;
	error?: string;
	message?: string;
}

export class LiveChallengeService {
	/**
	 * Mark unanswered participants when timer expires
	 */
	private static async markUnansweredParticipants(challengeCode: string, questionIndex: number): Promise<number> {
		try {
			const baseRef = db.ref(`liveChallenges/${challengeCode}`);

			// Get all active participants
			const participantsSnap = await baseRef.child('participants').get();
			const participants = participantsSnap.val() || {};
			const activeParticipantIds = Object.keys(participants).filter(
				(id) => participants[id]?.active !== false
			);

			// Get who has answered
			const answersSnap = await baseRef.child(`answers/${questionIndex}`).get();
			const answeredIds = answersSnap.exists() ? Object.keys(answersSnap.val()) : [];

			// Find participants who didn't answer
			const unansweredIds = activeParticipantIds.filter(id => !answeredIds.includes(id));

			// Mark them as having no answer (time expired)
			const ts = Date.now();
			const updates: any = {};
			for (const userId of unansweredIds) {
				updates[`answers/${questionIndex}/${userId}`] = {
					answer: null,
					isCorrect: false,
					ts,
					timeExpired: true,
					autoMarked: true
				};
			}

			if (Object.keys(updates).length > 0) {
				await baseRef.update(updates);
			}

			return unansweredIds.length;
		} catch (err) {
			console.error('markUnansweredParticipants error:', err);
			return 0;
		}
	}

	/**
	 * Get quiz questions with answers
	 */
	private static async getQuizQuestionsWithAnswers(quizId: string) {
		const quiz = await QuizModel.findById(quizId);
		if (!quiz) {
			throw ErrorHandler.createError('Quiz not found', 404);
		}

		const ids = quiz.questions.map((q: any) => new mongoose.Types.ObjectId(q));
		const docs = await QuestionModel.find({ _id: { $in: ids } });

		return docs.map((q) => ({
			questionId: q._id.toString(),
			question: q.question,
			options: q.options,
			answer: (q.answer || '').toString().trim().toLowerCase(),
		}));
	}

	/**
	 * Generate quiz questions using AI
	 */
	private static async generateQuizQuestions(chapter: any, userId: string): Promise<any[] | null> {
		const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;

		if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
			return null;
		}

		const needed = 50;
		const systemPrompt = `You are an AI assistant that creates multiple choice quizzes based on educational content.

IMPORTANT INSTRUCTIONS:
1. Read and analyze the provided chapter content carefully
2. Generate exactly ${needed} new questions ONLY from the information contained in this specific chapter
3. Questions must be directly related to the topics, concepts, and information present in the chapter content
4. Do NOT create generic questions or questions from outside knowledge
5. Each question should test understanding of specific content from the chapter
6. Do NOT repeat any questions

Requirements for each question:
- Must be answerable using only information from the chapter
- Should test key concepts, facts, or principles from the content
- Include 4 distinct options (labeled a, b, c, d)
- Only one option should be correct
- Provide a clear explanation referencing the chapter content

Output Format (JSON array only, no additional text):
[
  {
    "question": "Your question text based on chapter content?",
    "options": ["a) Option1", "b) Option2", "c) Option3", "d) Option4"],
    "answer": "a",
    "explanation": "Brief explanation referencing the chapter content."
  }
]`;

		let rawText: string;

		if (hasOvercontent) {
			// Use OpenRouter with extracted text (fast path)
			const userPrompt = `Chapter Content:\n${chapter.overcontent}\n\nGenerate ${needed} quiz questions from this content.`;

			try {
				const response = await callOpenRouterApi({
					model: 'openrouter/auto',
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userPrompt }
					],
					temperature: 0.7
				});
				rawText = extractOpenRouterText(response);
			} catch (apiErr) {
				console.error('OpenRouter API error:', apiErr);
				throw new Error('Failed to generate quiz questions');
			}
		} else {
			// Fallback to Gemini with PDF (multi-modal path)
			console.log('⚠️ overcontent is null, falling back to Gemini API with PDF');

			const base64File = chapter.content.toString("base64");
			const mimeType = getMimeType("chapter.pdf", chapter.contentType);

			const geminiPrompt = `${systemPrompt}\n\nChapter Content in the attached PDF.\n\nGenerate ${needed} quiz questions from the PDF content.`;

			try {
				const response = await retryGeminiApiCall({
					contents: [{
						parts: [
							{ text: geminiPrompt },
							{ inlineData: { mimeType, data: base64File } }
						]
					}],
					generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
				});
				const data = await response.json();
				rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
			} catch (apiErr) {
				console.error('Gemini API error:', apiErr);
				throw new Error('Failed to generate quiz questions');
			}
		}

		// Parse output (works for both OpenRouter and Gemini)
		let newMcqs: any[] = [];
		try {
			newMcqs = parseOpenRouterJson(rawText);
		} catch (parseErr) {
			// Fallback: try regex parsing
			const pattern = /\{\s*"question"\s*:\s*"([^"]+)",\s*"options"\s*:\s*\[([^\]]+)\],\s*"answer"\s*:\s*"([a-d])",\s*"explanation"\s*:\s*"([^"]+)"\s*\}/gm;
			const matches = [...rawText.matchAll(pattern)];

			for (const m of matches) {
				const options = m[2].split(",").map((s: any) =>
					s.trim().replace(/^"|"$/g, "")
				);

				if (options.length === 4) {
					newMcqs.push({
						question: m[1],
						options,
						answer: m[3],
						explanation: m[4],
					});
				}
			}
		}

		newMcqs = newMcqs.filter(
			(mcq) =>
				mcq.question &&
				Array.isArray(mcq.options) &&
				mcq.options.length === 4 &&
				["a", "b", "c", "d"].includes(mcq.answer?.toLowerCase())
		).slice(0, needed);

		return newMcqs;
	}

	/**
	 * Create a live challenge
	 */
	static async createChallenge(
		ownerId: string,
		username: string,
		email: string,
		chapterId: string
	): Promise<ServiceResult> {
		if (!ownerId) {
			return { success: false, statusCode: 401, error: 'Unauthorized' };
		}
		if (!chapterId || !isValidObjectId(chapterId)) {
			return { success: false, statusCode: 400, error: 'Valid chapterId required' };
		}

		let quiz = await QuizModel.findOne({ chapterId });
		let targetQuizId: string;

		if (!quiz) {
			const chapter = await ChapterModel.findById(chapterId);
			if (!chapter) {
				return { success: false, statusCode: 404, error: 'Chapter not found' };
			}

			const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;
			if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
				return { success: false, statusCode: 400, error: 'Chapter content is missing' };
			}

			let newMcqs: any[];
			try {
				const generated = await this.generateQuizQuestions(chapter, ownerId);
				if (!generated) {
					return { success: false, statusCode: 400, error: 'Chapter content is missing' };
				}
				newMcqs = generated;
			} catch (err) {
				return { success: false, statusCode: 500, error: 'Failed to generate quiz questions' };
			}

			if (newMcqs.length < 10) {
				return { success: false, statusCode: 500, error: 'Insufficient questions generated' };
			}

			quiz = new QuizModel({
				chapterId,
				title: chapter.title || 'Generated Quiz',
				questions: [],
				createdBy: ownerId,
				updatedBy: ownerId,
			});
			await quiz.save();

			const questionDocs = await QuestionModel.insertMany(
				newMcqs.map((mcq) => ({
					quizId: quiz!._id,
					question: mcq.question,
					options: mcq.options,
					answer: mcq.answer.toLowerCase(),
					explanation: mcq.explanation,
					createdBy: ownerId,
					updatedBy: ownerId,
				}))
			);

			quiz.questions = questionDocs.map((q) => q._id);
			await quiz.save();
		}

		targetQuizId = quiz._id.toString();

		const questions = await this.getQuizQuestionsWithAnswers(targetQuizId);

		if (questions.length === 0) {
			return { success: false, statusCode: 400, error: 'No questions available for this quiz' };
		}

		// Select 15 random questions (or fewer if not enough exist)
		const MAX_QUESTIONS = 15;
		const shuffled = [...questions];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		const selectedQuestions = shuffled.slice(0, Math.min(MAX_QUESTIONS, shuffled.length));

		// Generate unique code with max attempts to avoid infinite loop
		let challengeCode = '';
		let attempts = 0;
		const maxAttempts = 10;
		do {
			challengeCode = uuidv4().slice(0, 6).toUpperCase();
			const exists = await db.ref(`liveChallenges/${challengeCode}/meta`).get();
			if (!exists.exists()) break;
			attempts++;
			if (attempts >= maxAttempts) {
				return { success: false, statusCode: 500, error: 'Failed to generate unique challenge code' };
			}
		} while (true);

		const now = Date.now();
		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		// Fetch profile to get photo
		const profile = await ProfileService.getProfile(ownerId);
		const participantObj: any = {
			username,
			email,
			score: 0,
			joinedAt: now,
			active: true,
		};
		if (profile && profile.profilePicture) {
			participantObj.photoUrl = profile.profilePicture;
		}

		await baseRef.set({
			meta: {
				ownerId,
				ownerUsername: username,
				quizId: targetQuizId,
				chapterId: chapterId || null,
				status: 'waiting',
				createdAt: now,
				updatedAt: now,
				challengeCode,
			},
			participants: {
				[ownerId]: participantObj,
			},
			questions: selectedQuestions,
			current: { index: -1 },
			answers: {},
			rankings: [],
		});

		// Prepare QR (optional)
		let qrDataUrl: string | null = null;
		try {
			qrDataUrl = await QRCode.toDataURL(challengeCode);
		} catch (qrErr) {
			console.error('QR generation error:', qrErr);
			qrDataUrl = null;
		}

		// Prepare ChallengeResult skeleton (Mongo) for clean lifecycle tracking
		const challengeResult = new ChallengeResultModel({
			challengeCode,
			owner: new mongoose.Types.ObjectId(ownerId),
			quizId: new mongoose.Types.ObjectId(targetQuizId),
			chapterId: chapterId ? new mongoose.Types.ObjectId(chapterId) : undefined,
			status: 'waiting',
			participants: [
				{
					userId: new mongoose.Types.ObjectId(ownerId),
					username,
					score: 0,
					answers: [],
				},
			],
			questions: selectedQuestions.map((q) => ({
				questionId: new mongoose.Types.ObjectId(q.questionId),
				question: q.question,
				options: q.options,
				answer: q.answer,
			})),
			finalRankings: [],
			createdAt: new Date(now),
		});
		await challengeResult.save();

		return {
			success: true,
			statusCode: 201,
			message: 'Live challenge created',
			data: {
				challengeCode,
				qr: qrDataUrl,
				totalQuestions: selectedQuestions.length
			}
		};
	}

	/**
	 * Join a live challenge
	 */
	static async joinChallenge(
		userId: string,
		username: string,
		email: string,
		challengeCode: string
	): Promise<ServiceResult> {
		if (!challengeCode || !userId) {
			return { success: false, statusCode: 400, error: 'challengeCode required' };
		}

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) {
			return { success: false, statusCode: 404, error: 'Challenge not found' };
		}
		const meta = metaSnap.val();

		// Allow rejoining if challenge is in-progress (for reconnection)
		if (meta.status !== 'waiting' && meta.status !== 'in-progress') {
			return { success: false, statusCode: 400, error: 'Challenge already completed' };
		}

		const now = Date.now();
		const participantSnap = await baseRef.child(`participants/${userId}`).get();

		if (participantSnap.exists()) {
			// User is reconnecting - mark them as active again
			const existingData = participantSnap.val();
			// Fetch profile to get photo
			const profile = await ProfileService.getProfile(userId);
			const updateObj: any = {
				active: true,
				rejoinedAt: now,
				username,
				email,
			};
			if (profile && profile.profilePicture) {
				updateObj.photoUrl = profile.profilePicture;
			}
			await baseRef.child(`participants/${userId}`).update(updateObj);

			return {
				success: true,
				statusCode: 200,
				message: 'Reconnected to challenge',
				data: {
					challengeCode,
					isReconnection: true,
					currentScore: existingData.score || 0,
				}
			};
		} else {
			// New participant joining
			if (meta.status !== 'waiting') {
				return { success: false, statusCode: 400, error: 'Cannot join: Challenge already in progress' };
			}

			// Fetch profile to get photo
			const profile = await ProfileService.getProfile(userId);
			const participantObj: any = {
				username,
				email,
				score: 0,
				joinedAt: now,
				active: true,
			};
			if (profile && profile.profilePicture) {
				participantObj.photoUrl = profile.profilePicture;
			}

			await baseRef.child(`participants/${userId}`).set(participantObj);

			// Mirror in Mongo participants array (append if not existing)
			await ChallengeResultModel.updateOne(
				{ challengeCode },
				{
					$set: { status: 'waiting' },
					$addToSet: {
						participants: {
							userId: new mongoose.Types.ObjectId(userId),
							username,
							score: 0,
							answers: [],
						},
					},
				}
			);

			// Track challenge participation in profile
			try {
				await ProfileService.incrementChallengesTaken(userId);
				await ProfileService.updateStreak(userId);
			} catch (e) {
				console.error("Error tracking challenge participation:", e);
			}

			return {
				success: true,
				statusCode: 200,
				message: 'Joined challenge',
				data: {
					challengeCode,
					isReconnection: false,
				}
			};
		}
	}

	/**
	 * Disconnect from a live challenge
	 */
	static async disconnect(userId: string, challengeCode: string): Promise<ServiceResult> {
		if (!challengeCode || !userId) {
			return { success: false, statusCode: 400, error: 'challengeCode required' };
		}

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) {
			return { success: false, statusCode: 404, error: 'Challenge not found' };
		}

		const participantSnap = await baseRef.child(`participants/${userId}`).get();
		if (!participantSnap.exists()) {
			return { success: false, statusCode: 404, error: 'Participant not found in this challenge' };
		}

		// Mark participant as inactive (don't remove them)
		const now = Date.now();
		await baseRef.child(`participants/${userId}`).update({
			active: false,
			disconnectedAt: now,
		});

		return {
			success: true,
			statusCode: 200,
			message: 'Marked as disconnected',
			data: { challengeCode }
		};
	}

	/**
	 * Start a live challenge
	 */
	static async startChallenge(userId: string, challengeCode: string): Promise<ServiceResult> {
		if (!challengeCode || !userId) {
			return { success: false, statusCode: 400, error: 'challengeCode required' };
		}

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) {
			return { success: false, statusCode: 404, error: 'Challenge not found' };
		}
		const meta = metaSnap.val();
		if (meta.ownerId !== userId) {
			return { success: false, statusCode: 403, error: 'Only owner can start' };
		}
		if (meta.status !== 'waiting') {
			return { success: false, statusCode: 400, error: 'Already started or completed' };
		}

		const questionsSnap = await baseRef.child('questions').get();
		if (!questionsSnap.exists() || !Array.isArray(questionsSnap.val()) || questionsSnap.val().length === 0) {
			return { success: false, statusCode: 400, error: 'No questions available in challenge' };
		}

		const participantsSnap = await baseRef.child('participants').get();
		const participants = participantsSnap.val() || {};
		const activeParticipants = Object.keys(participants).filter(
			(uid) => participants[uid]?.active !== false
		);
		const participantCount = activeParticipants.length;
		if (participantCount < 2) {
			return { success: false, statusCode: 400, error: 'At least one additional active participant required to start' };
		}

		const now = Date.now();
		await baseRef.update({
			meta: { ...meta, status: 'in-progress', updatedAt: now, startedAt: now },
			current: { index: 0, startTime: now, endTime: now + QUESTION_DURATION },
		});

		// Mirror status in Mongo
		await ChallengeResultModel.updateOne(
			{ challengeCode },
			{ $set: { status: 'in-progress', startedAt: new Date(now) } }
		);

		return {
			success: true,
			statusCode: 200,
			message: 'Challenge started',
			data: {
				totalQuestions: questionsSnap.val().length,
				currentIndex: 0,
			}
		};
	}

	/**
	 * Submit an answer for a live challenge
	 */
	static async submitAnswer(
		userId: string,
		username: string,
		challengeCode: string,
		answer: string
	): Promise<ServiceResult> {
		if (!challengeCode || !userId) {
			return { success: false, statusCode: 400, error: 'challengeCode required' };
		}
		if (!answer) {
			return { success: false, statusCode: 400, error: 'answer required' };
		}

		const normalized = (answer || '').toString().trim().toLowerCase();
		if (!['a', 'b', 'c', 'd'].includes(normalized)) {
			return { success: false, statusCode: 400, error: 'Invalid answer format. Must be a, b, c, or d.' };
		}

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) {
			return { success: false, statusCode: 404, error: 'Challenge not found' };
		}
		const meta = metaSnap.val();
		if (meta.status !== 'in-progress') {
			return { success: false, statusCode: 400, error: 'Challenge not in progress' };
		}

		const currentSnap = await baseRef.child('current').get();
		const current = currentSnap.val() || { index: 0, startTime: 0 };
		const currentIdx = current.index;

		if (typeof currentIdx !== 'number' || currentIdx < 0) {
			return { success: false, statusCode: 400, error: 'Invalid current index' };
		}

		const idx = currentIdx;

		// Check for duplicate submission
		const existingAnswerSnap = await baseRef.child(`answers/${idx}/${userId}`).get();
		if (existingAnswerSnap.exists()) {
			return { success: false, statusCode: 400, error: 'Answer already submitted for this question' };
		}

		// Check if time has expired for current question
		const endTimeCurrent = (current.endTime || ((current.startTime || 0) + QUESTION_DURATION));
		const timeExpired = Date.now() >= endTimeCurrent;

		if (timeExpired) {
			// Time expired - record as no answer (missed)
			const ts = Date.now();
			await baseRef.child(`answers/${idx}/${userId}`).set({
				answer: null,
				isCorrect: false,
				ts,
				timeExpired: true
			});

			return {
				success: false,
				statusCode: 400,
				message: 'Time expired: Answer not recorded',
				data: {
					currentIndex: idx,
					timeExpired: true,
					isCorrect: false
				}
			};
		}

		const qSnap = await baseRef.child(`questions/${idx}`).get();
		if (!qSnap.exists()) {
			return { success: false, statusCode: 404, error: 'Question not found' };
		}
		const q = qSnap.val();

		const isCorrect = normalized === ((q.answer || '').toString().trim().toLowerCase());
		const ts = Date.now();

		// Write answer
		await baseRef.child(`answers/${idx}/${userId}`).set({ answer: normalized, isCorrect, ts });

		// Update streak when user participates in challenge
		try {
			await ProfileService.updateStreak(userId);
		} catch (e) {
			console.error("Error updating streak:", e);
		}

		// Update participant score
		const scoreRef = baseRef.child(`participants/${userId}/score`);
		await scoreRef.transaction((curr) => {
			const s = typeof curr === 'number' ? curr : 0;
			return isCorrect ? s + 1 : s;
		});

		// Recompute rankings
		const pSnap = await baseRef.child('participants').get();
		const participants = pSnap.val() || {};
		const rankings = Object.keys(participants)
			.map((uid) => ({
				userId: uid,
				score: participants[uid]?.score || 0,
				name: participants[uid]?.username || '',
				email: participants[uid]?.email || '',
				photoUrl: participants[uid]?.photoUrl || participants[uid]?.profilePicture || '',
			}))
			.sort((a, b) => b.score - a.score);
		await baseRef.child('rankings').set(rankings);

		// Mirror answer in Mongo
		const qIdSnap = await baseRef.child(`questions/${idx}/questionId`).get();
		const questionIdStr = qIdSnap.val() as string;

		await ChallengeResultModel.updateOne(
			{ challengeCode, 'participants.userId': new mongoose.Types.ObjectId(userId) },
			{
				$push: {
					'participants.$.answers': {
						questionId: new mongoose.Types.ObjectId(questionIdStr),
						selectedOption: normalized,
						isCorrect,
						answeredAt: new Date(ts),
					},
				},
				$set: {
					'participants.$.username': username,
				},
			}
		);

		// Check if all participants (including owner) have answered OR timer expired; then auto-advance if needed
		const pSnapAfter = await baseRef.child('participants').get();
		const participantsAfter = pSnapAfter.val() || {};
		const activeParticipantIdsAfter = Object.keys(participantsAfter).filter(
			(id) => participantsAfter[id]?.active !== false
		);
		const activeParticipantCountAfter = activeParticipantIdsAfter.length;

		const answersSnapAfter = await baseRef.child(`answers/${idx}`).get();
		const answeredIdsAfter = answersSnapAfter.exists() ? Object.keys(answersSnapAfter.val()) : [];

		const allAnsweredAfter = activeParticipantCountAfter > 0 && activeParticipantIdsAfter.every((id) => answeredIdsAfter.includes(id));

		// Timer check (30 seconds per question) - consistent with advanceLiveChallenge
		const endTimeAfter = (current.endTime || ((current.startTime || 0) + QUESTION_DURATION));
		const timeExpiredAfter = Date.now() >= endTimeAfter;

		if (allAnsweredAfter || timeExpiredAfter) {
			// Mark any remaining unanswered participants if time expired
			if (timeExpiredAfter && !allAnsweredAfter) {
				await this.markUnansweredParticipants(challengeCode, idx);
			}

			// Auto-advance to next question since all active participants have answered or time expired
			const questionsSnap = await baseRef.child('questions').get();
			const questions = questionsSnap.val() || [];
			const total = questions.length;

			if (idx + 1 < total) {
				const advanceTime = Date.now();
				await baseRef.child('current').set({ index: idx + 1, startTime: advanceTime, endTime: advanceTime + QUESTION_DURATION });
				await baseRef.child('meta/updatedAt').set(advanceTime);
			} else {
				// Challenge completed
				const now = Date.now();
				await baseRef.update({
					meta: { ...meta, status: 'completed', updatedAt: now, completedAt: now },
				});

				// Persist final rankings in Mongo
				const rankingsSnap = await baseRef.child('rankings').get();
				const rankingsData = (rankingsSnap.val() || []) as Array<{ userId: string; score: number }>;
				const finalRankings = rankingsData.map((r, i) => ({
					userId: new mongoose.Types.ObjectId(r.userId),
					score: r.score,
					rank: i + 1,
				}));

				await ChallengeResultModel.updateOne(
					{ challengeCode },
					{
						$set: {
							status: 'completed',
							completedAt: new Date(now),
							finalRankings,
						},
					}
				);
			}
		}

		return {
			success: true,
			statusCode: 200,
			message: 'Answer recorded',
			data: {
				isCorrect,
				currentIndex: idx,
				rankings,
			}
		};
	}

	/**
	 * Advance to next question in a live challenge
	 */
	static async advanceChallenge(userId: string, challengeCode: string, force?: boolean): Promise<ServiceResult> {
		if (!challengeCode || !userId) {
			return { success: false, statusCode: 400, error: 'challengeCode required' };
		}

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) {
			return { success: false, statusCode: 404, error: 'Challenge not found' };
		}
		const meta = metaSnap.val();
		if (meta.status !== 'in-progress') {
			return { success: false, statusCode: 400, error: 'Challenge not in progress' };
		}

		const currentSnap = await baseRef.child('current').get();
		const current = currentSnap.val() || { index: 0, startTime: 0 };
		const idx = current.index || 0;
		const startTime = current.startTime || 0;
		const endTime = current.endTime || (startTime + QUESTION_DURATION);

		const questionsSnap = await baseRef.child('questions').get();
		const questions = questionsSnap.val() || [];
		const total = questions.length;
		if (total === 0) {
			return { success: false, statusCode: 400, error: 'No questions in challenge' };
		}

		// Check participants and answers
		const pSnap = await baseRef.child('participants').get();
		const participants = pSnap.val() || {};
		// Include only active participants for the "all answered" condition
		const activeParticipantIds = Object.keys(participants).filter(
			(id) => participants[id]?.active !== false
		);
		const activeParticipantCount = activeParticipantIds.length;

		const answersSnap = await baseRef.child(`answers/${idx}`).get();
		const answeredIds = answersSnap.exists() ? Object.keys(answersSnap.val()) : [];

		const allAnswered = activeParticipantCount > 0 && activeParticipantIds.every((id) => answeredIds.includes(id));

		// Timer check (30 seconds per question)
		const now = Date.now();
		const timeExpired = now >= endTime;

		// Check if advancement is allowed ONLY when all participants (including owner) answered OR time expired
		const canAdvance = allAnswered || timeExpired;
		if (!canAdvance) {
			return {
				success: false,
				statusCode: 403,
				message: 'Waiting for all active participants to answer or timer to expire',
				data: {
					currentIndex: idx,
					totalQuestions: total,
					answeredCount: answeredIds.length,
					activeParticipantCount,
					timeRemaining: Math.max(0, (current.endTime || (startTime + QUESTION_DURATION)) - now),
				}
			};
		}

		// If advancing due to timer expiration, mark unanswered participants
		let markedCount = 0;
		if (timeExpired && !allAnswered) {
			markedCount = await this.markUnansweredParticipants(challengeCode, idx);
		}

		if (idx + 1 < total) {
			const advanceTime = Date.now();
			await baseRef.child('current').set({ index: idx + 1, startTime: advanceTime, endTime: advanceTime + QUESTION_DURATION });
			await baseRef.child('meta/updatedAt').set(advanceTime);
			return {
				success: true,
				statusCode: 200,
				message: 'Advanced to next question',
				data: {
					currentIndex: idx + 1,
					totalQuestions: total,
					unansweredCount: markedCount > 0 ? markedCount : undefined,
				}
			};
		} else {
			const nowComplete = Date.now();
			await baseRef.update({
				meta: { ...meta, status: 'completed', updatedAt: nowComplete, completedAt: nowComplete },
			});

			// Persist final rankings and mark completion in Mongo
			const rankingsSnap = await baseRef.child('rankings').get();
			const rankings = (rankingsSnap.val() || []) as Array<{ userId: string; score: number }>;
			const finalRankings = rankings.map((r, i) => ({
				userId: new mongoose.Types.ObjectId(r.userId),
				score: r.score,
				rank: i + 1,
			}));

			await ChallengeResultModel.updateOne(
				{ challengeCode },
				{
					$set: {
						status: 'completed',
						completedAt: new Date(nowComplete),
						finalRankings,
					},
				}
			);

			return {
				success: true,
				statusCode: 200,
				message: 'Challenge completed',
				data: { finalRankings }
			};
		}
	}

	/**
	 * Check and advance if timer expired
	 */
	static async checkAndAdvance(userId: string, challengeCode: string): Promise<ServiceResult> {
		if (!challengeCode || !userId) {
			return { success: false, statusCode: 400, error: 'challengeCode required' };
		}

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) {
			return { success: false, statusCode: 404, error: 'Challenge not found' };
		}
		const meta = metaSnap.val();
		if (meta.status !== 'in-progress') {
			return {
				success: true,
				statusCode: 200,
				data: {
					needsAdvance: false,
					status: meta.status
				}
			};
		}

		const currentSnap = await baseRef.child('current').get();
		const current = currentSnap.val() || { index: 0, startTime: 0 };
		const idx = current.index || 0;
		const startTime = current.startTime || 0;
		const endTime = current.endTime || (startTime + QUESTION_DURATION);

		// Check if time has expired
		const now = Date.now();
		const timeExpired = now >= endTime;

		if (!timeExpired) {
			return {
				success: true,
				statusCode: 200,
				data: {
					needsAdvance: false,
					currentIndex: idx,
					timeRemaining: Math.max(0, (current.endTime || (startTime + QUESTION_DURATION)) - now),
				}
			};
		}

		// Time expired - check if already all answered
		const pSnap = await baseRef.child('participants').get();
		const participants = pSnap.val() || {};
		const activeParticipantIds = Object.keys(participants).filter(
			(id) => participants[id]?.active !== false
		);

		const answersSnap = await baseRef.child(`answers/${idx}`).get();
		const answeredIds = answersSnap.exists() ? Object.keys(answersSnap.val()) : [];

		const allAnswered = activeParticipantIds.length > 0 && activeParticipantIds.every((id) => answeredIds.includes(id));

		if (allAnswered) {
			// Already all answered, no need to mark
			return {
				success: true,
				statusCode: 200,
				data: {
					needsAdvance: true,
					allAnswered: true,
					currentIndex: idx,
				}
			};
		}

		// Mark unanswered participants
		const markedCount = await this.markUnansweredParticipants(challengeCode, idx);

		// Get questions to check if there are more
		const questionsSnap = await baseRef.child('questions').get();
		const questions = questionsSnap.val() || [];
		const total = questions.length;

		if (idx + 1 < total) {
			// Advance to next question
			const advanceTime = Date.now();
			await baseRef.child('current').set({ index: idx + 1, startTime: advanceTime, endTime: advanceTime + QUESTION_DURATION });
			await baseRef.child('meta/updatedAt').set(advanceTime);

			return {
				success: true,
				statusCode: 200,
				data: {
					needsAdvance: true,
					advanced: true,
					currentIndex: idx + 1,
					totalQuestions: total,
					unansweredCount: markedCount,
				}
			};
		} else {
			// Quiz completed
			await baseRef.update({
				meta: { ...meta, status: 'completed', updatedAt: now, completedAt: now },
			});

			// Persist final rankings
			const rankingsSnap = await baseRef.child('rankings').get();
			const rankings = (rankingsSnap.val() || []) as Array<{ userId: string; score: number }>;
			const finalRankings = rankings.map((r, i) => ({
				userId: new mongoose.Types.ObjectId(r.userId),
				score: r.score,
				rank: i + 1,
			}));

			await ChallengeResultModel.updateOne(
				{ challengeCode },
				{
					$set: {
						status: 'completed',
						completedAt: new Date(now),
						finalRankings,
					},
				}
			);

			return {
				success: true,
				statusCode: 200,
				data: {
					needsAdvance: true,
					completed: true,
					finalRankings,
				}
			};
		}
	}
}
