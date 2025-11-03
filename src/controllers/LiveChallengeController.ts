import { Response } from 'express';
import mongoose, { isValidObjectId } from 'mongoose';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import ChallengeResultModel from '../models/ChallengeResultModel';
import ChapterModel from '../models/ChapterModel';
import QuestionModel from '../models/QuestionModel';
import QuizModel from '../models/QuizModel';
import { ProfileService } from '../services/profileService';
import { admin } from '../utils/firebase';
import { getMimeType, retryGeminiApiCall } from '../utils/geminiApi';
import { callGroqApi, extractGroqText, parseGroqJson } from '../utils/groqApi';

const db = admin.database();

// Constants
const QUESTION_DURATION = 30000; // 30 seconds

// Helper function to mark unanswered participants when timer expires
const markUnansweredParticipants = async (challengeCode: string, questionIndex: number) => {
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
};

const getQuizQuestionsWithAnswers = async (quizId: string) => {
	const quiz = await QuizModel.findById(quizId);
	if (!quiz) throw new Error('Quiz not found');

	const ids = quiz.questions.map((q: any) => new mongoose.Types.ObjectId(q));
	const docs = await QuestionModel.find({ _id: { $in: ids } });

	return docs.map((q) => ({
		questionId: q._id.toString(),
		question: q.question,
		options: q.options,
		answer: (q.answer || '').toString().trim().toLowerCase(),
	}));
};

export const createLiveChallenge = async (req: any, res: Response) => {
	try {
		const ownerId = req.user._id?.toString();
		const username = req.user.username || 'Owner';
		const { chapterId } = req.body || {};
		if (!ownerId) return res.status(401).json({ message: 'Unauthorized' });
		if (!chapterId || !isValidObjectId(chapterId)) return res.status(400).json({ message: 'Valid chapterId required' });

		let quiz = await QuizModel.findOne({ chapterId });
		let targetQuizId: string;

		if (!quiz) {
			const chapter = await ChapterModel.findById(chapterId);
			if (!chapter) return res.status(404).json({ message: 'Chapter not found' });
			
			const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;
			
			if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
				return res.status(400).json({ message: 'Chapter content is missing' });
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
				// ✅ Use Groq with extracted text (fast path)
				const userPrompt = `Chapter Content:\n${chapter.overcontent}\n\nGenerate ${needed} quiz questions from this content.`;

				try {
					const response = await callGroqApi({
						model: 'llama-3.3-70b-versatile' as const,
						messages: [
							{ role: 'system' as const, content: systemPrompt },
							{ role: 'user' as const, content: userPrompt }
						],
						temperature: 0.7,
						max_tokens: 8192,
					});
					rawText = extractGroqText(response);
				} catch (apiErr) {
					console.error('Groq API error:', apiErr);
					return res.status(500).json({ message: 'Failed to generate quiz questions' });
				}
			} else {
				// ✅ Fallback to Gemini with PDF (multi-modal path)
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
					return res.status(500).json({ message: 'Failed to generate quiz questions' });
				}
			}

			// Parse output (works for both Groq and Gemini)
			let newMcqs: any[] = [];
			try {
				newMcqs = parseGroqJson(rawText);
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

			if (newMcqs.length < 10) { // Minimum threshold for a valid quiz
				return res.status(500).json({ message: 'Insufficient questions generated' });
			}

			quiz = new QuizModel({
				chapterId,
				title: chapter.title || 'Generated Quiz',
				questions: [],
				createdBy: req.user._id,
				updatedBy: req.user._id,
			});
			await quiz.save();

			const questionDocs = await QuestionModel.insertMany(
				newMcqs.map((mcq) => ({
					quizId: quiz!._id,
					question: mcq.question,
					options: mcq.options,
					answer: mcq.answer.toLowerCase(),
					explanation: mcq.explanation,
					createdBy: req.user._id,
					updatedBy: req.user._id,
				}))
			);

			quiz.questions = questionDocs.map((q) => q._id);
			await quiz.save();
		}

		targetQuizId = quiz._id.toString();

		const questions = await getQuizQuestionsWithAnswers(targetQuizId);

		if (questions.length === 0) {
			return res.status(400).json({ message: 'No questions available for this quiz' });
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
				return res.status(500).json({ message: 'Failed to generate unique challenge code' });
			}
		} while (true);

		const now = Date.now();
		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
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
				[ownerId]: { username, email: req.user.email, photoUrl: req.user.profilePicture, score: 0, joinedAt: now, active: true },
			},
			questions: selectedQuestions, // includes answers for synchronized correctness
			current: { index: -1 }, // -1 before start
			answers: {}, // answers[index][userId] = { answer, isCorrect, ts }
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

		return res.status(201).json({
			success: true,
			message: 'Live challenge created',
			challengeCode,
			qr: qrDataUrl,
			questions: selectedQuestions
		});
	} catch (err: any) {
		console.error('createLiveChallenge error:', err);
		return res.status(500).json({ message: 'Server error', details: err.message });
	}
};

export const joinLiveChallenge = async (req: any, res: Response) => {
	try {
		const { challengeCode } = req.body || {};
		const userId = req.user._id?.toString();
		const username = req.user.username || 'Player';
		if (!challengeCode || !userId) return res.status(400).json({ message: 'challengeCode required' });

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) return res.status(404).json({ message: 'Challenge not found' });
		const meta = metaSnap.val();
		
		// Allow rejoining if challenge is in-progress (for reconnection)
		if (meta.status !== 'waiting' && meta.status !== 'in-progress') {
			return res.status(400).json({ message: 'Challenge already completed' });
		}

		const now = Date.now();
		const participantSnap = await baseRef.child(`participants/${userId}`).get();
		
		if (participantSnap.exists()) {
			// User is reconnecting - mark them as active again
			const existingData = participantSnap.val();
			await baseRef.child(`participants/${userId}`).update({
				active: true,
				rejoinedAt: now,
				username, // Update username in case it changed
				email: req.user.email,
				photoUrl: req.user.profilePicture,
			});

			return res.status(200).json({
				success: true,
				message: 'Reconnected to challenge',
				challengeCode,
				isReconnection: true,
				currentScore: existingData.score || 0,
			});
		} else {
			// New participant joining
			if (meta.status !== 'waiting') {
				return res.status(400).json({ message: 'Cannot join: Challenge already in progress' });
			}

			await baseRef.child(`participants/${userId}`).set({
				username,
				email: req.user.email,
				photoUrl: req.user.profilePicture,
				score: 0,
				joinedAt: now,
				active: true,
			});

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

			return res.status(200).json({
				success: true,
				message: 'Joined challenge',
				challengeCode,
				isReconnection: false,
			});
		}
	} catch (err: any) {
		console.error('joinLiveChallenge error:', err);
		return res.status(500).json({ message: 'Server error', details: err.message });
	}
};

export const disconnectFromLiveChallenge = async (req: any, res: Response) => {
	try {
		const { challengeCode } = req.body || {};
		const userId = req.user._id?.toString();
		if (!challengeCode || !userId) return res.status(400).json({ message: 'challengeCode required' });

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) return res.status(404).json({ message: 'Challenge not found' });

		const participantSnap = await baseRef.child(`participants/${userId}`).get();
		if (!participantSnap.exists()) {
			return res.status(404).json({ message: 'Participant not found in this challenge' });
		}

		// Mark participant as inactive (don't remove them)
		const now = Date.now();
		await baseRef.child(`participants/${userId}`).update({
			active: false,
			disconnectedAt: now,
		});

		return res.status(200).json({
			success: true,
			message: 'Marked as disconnected',
			challengeCode,
		});
	} catch (err: any) {
		console.error('disconnectFromLiveChallenge error:', err);
		return res.status(500).json({ message: 'Server error', details: err.message });
	}
};

export const startLiveChallenge = async (req: any, res: Response) => {
	try {
		const { challengeCode } = req.body || {};
		const userId = req.user._id?.toString();
		if (!challengeCode || !userId) return res.status(400).json({ message: 'challengeCode required' });

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) return res.status(404).json({ message: 'Challenge not found' });
		const meta = metaSnap.val();
		if (meta.ownerId !== userId) return res.status(403).json({ message: 'Only owner can start' });
		if (meta.status !== 'waiting') return res.status(400).json({ message: 'Already started or completed' });

		const questionsSnap = await baseRef.child('questions').get();
		if (!questionsSnap.exists() || !Array.isArray(questionsSnap.val()) || questionsSnap.val().length === 0) {
			return res.status(400).json({ message: 'No questions available in challenge' });
		}

		const participantsSnap = await baseRef.child('participants').get();
		const participants = participantsSnap.val() || {};
		const activeParticipants = Object.keys(participants).filter(
			(uid) => participants[uid]?.active !== false
		);
		const participantCount = activeParticipants.length;
		if (participantCount < 2) { // At least one participant besides the owner
			return res.status(400).json({ message: 'At least one additional active participant required to start' });
		}

		const now = Date.now();
		await baseRef.update({
			meta: { ...meta, status: 'in-progress', updatedAt: now, startedAt: now },
			current: { index: 0, startTime: now, endTime: now + QUESTION_DURATION }, // Start at first question with timer
		});

		// Mirror status in Mongo
		await ChallengeResultModel.updateOne(
			{ challengeCode },
			{ $set: { status: 'in-progress', startedAt: new Date(now) } }
		);

		return res.status(200).json({
			success: true,
			message: 'Challenge started',
			totalQuestions: questionsSnap.val().length,
			currentIndex: 0,
		});
	} catch (err: any) {
		console.error('startLiveChallenge error:', err);
		return res.status(500).json({ message: 'Server error', details: err.message });
	}
};

export const submitLiveAnswer = async (req: any, res: Response) => {
	try {
		const { challengeCode, answer } = req.body || {};
		const userId = req.user._id?.toString();
		const username = req.user.username || 'Player';
		if (!challengeCode || !userId) return res.status(400).json({ message: 'challengeCode required' });
		if (!answer) return res.status(400).json({ message: 'answer required' });

		const normalized = (answer || '').toString().trim().toLowerCase();
		if (!['a', 'b', 'c', 'd'].includes(normalized)) {
			return res.status(400).json({ message: 'Invalid answer format. Must be a, b, c, or d.' });
		}

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) return res.status(404).json({ message: 'Challenge not found' });
		const meta = metaSnap.val();
		if (meta.status !== 'in-progress') return res.status(400).json({ message: 'Challenge not in progress' });

		const currentSnap = await baseRef.child('current').get();
		const current = currentSnap.val() || { index: 0, startTime: 0 };
		const currentIdx = current.index;
		
		if (typeof currentIdx !== 'number' || currentIdx < 0) {
			return res.status(400).json({ message: 'Invalid current index' });
		}

		// Check if user is submitting for the current question
		const idx = currentIdx;

		// Check for duplicate submission
		const existingAnswerSnap = await baseRef.child(`answers/${idx}/${userId}`).get();
		if (existingAnswerSnap.exists()) {
			return res.status(400).json({ message: 'Answer already submitted for this question' });
		}

		// Check if time has expired for current question
		const QUESTION_DURATION = 30000; // 30 seconds
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

			// Don't update score for expired answers
			// Rankings remain unchanged

			return res.status(400).json({
				success: false,
				message: 'Time expired: Answer not recorded',
				currentIndex: idx,
				timeExpired: true,
				isCorrect: false
			});
		}

		const qSnap = await baseRef.child(`questions/${idx}`).get();
		if (!qSnap.exists()) return res.status(404).json({ message: 'Question not found' });
		const q = qSnap.val();

		const isCorrect = normalized === ((q.answer || '').toString().trim().toLowerCase());
		const ts = Date.now();

		// Write answer
		await baseRef.child(`answers/${idx}/${userId}`).set({ answer: normalized, isCorrect, ts });

		// ✅ Update streak when user participates in challenge
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
		); // Only consider active participants
		const activeParticipantCountAfter = activeParticipantIdsAfter.length;

		const answersSnapAfter = await baseRef.child(`answers/${idx}`).get();
		const answeredIdsAfter = answersSnapAfter.exists() ? Object.keys(answersSnapAfter.val()) : [];

		const allAnsweredAfter = activeParticipantCountAfter > 0 && activeParticipantIdsAfter.every((id) => answeredIdsAfter.includes(id));

		// Timer check (30 seconds per question) - consistent with advanceLiveChallenge
		const QUESTION_DURATION_CHECK = 30000; // 30 seconds
		const endTimeAfter = (current.endTime || ((current.startTime || 0) + QUESTION_DURATION_CHECK));
		const timeExpiredAfter = Date.now() >= endTimeAfter;

		if (allAnsweredAfter || timeExpiredAfter) {
			// Mark any remaining unanswered participants if time expired
			if (timeExpiredAfter && !allAnsweredAfter) {
				await markUnansweredParticipants(challengeCode, idx);
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
			}
		}

		return res.status(200).json({
			success: true,
			message: 'Answer recorded',
			isCorrect,
			currentIndex: idx,
			rankings,
		});
	} catch (err: any) {
		console.error('submitLiveAnswer error:', err);
		return res.status(500).json({ message: 'Server error', details: err.message });
	}
};

export const advanceLiveChallenge = async (req: any, res: Response) => {
	try {
		const { challengeCode, force } = req.body || {};
		const userId = req.user._id?.toString();
		if (!challengeCode || !userId) return res.status(400).json({ message: 'challengeCode required' });

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) return res.status(404).json({ message: 'Challenge not found' });
		const meta = metaSnap.val();
		if (meta.status !== 'in-progress') return res.status(400).json({ message: 'Challenge not in progress' });

		const currentSnap = await baseRef.child('current').get();
		const current = currentSnap.val() || { index: 0, startTime: 0 };
		const idx = current.index || 0;
		const startTime = current.startTime || 0;
		const endTime = current.endTime || (startTime + QUESTION_DURATION);

		const questionsSnap = await baseRef.child('questions').get();
		const questions = questionsSnap.val() || [];
		const total = questions.length;
		if (total === 0) return res.status(400).json({ message: 'No questions in challenge' });

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
			return res.status(403).json({
				success: false,
				message: 'Waiting for all active participants to answer or timer to expire',
				currentIndex: idx,
				totalQuestions: total,
				answeredCount: answeredIds.length,
				activeParticipantCount,
				timeRemaining: Math.max(0, (current.endTime || (startTime + QUESTION_DURATION)) - now),
			});
		}

		// If advancing due to timer expiration, mark unanswered participants
		let markedCount = 0;
		if (timeExpired && !allAnswered) {
			markedCount = await markUnansweredParticipants(challengeCode, idx);
		}

		if (idx + 1 < total) {
			const advanceTime = Date.now();
			await baseRef.child('current').set({ index: idx + 1, startTime: advanceTime, endTime: advanceTime + QUESTION_DURATION });
			await baseRef.child('meta/updatedAt').set(advanceTime);
			return res.status(200).json({
				success: true,
				message: 'Advanced to next question',
				currentIndex: idx + 1,
				totalQuestions: total,
				unansweredCount: markedCount > 0 ? markedCount : undefined,
			});
		} else {
			const now = Date.now();
			await baseRef.update({
				meta: { ...meta, status: 'completed', updatedAt: now, completedAt: now },
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
						completedAt: new Date(now),
						finalRankings,
					},
				}
			);

			return res.status(200).json({
				success: true,
				message: 'Challenge completed',
				finalRankings,
			});
		}
	} catch (err: any) {
		console.error('advanceLiveChallenge error', err);
		return res.status(500).json({ message: 'Server error', details: err.message });
	}
};

// Endpoint for frontend to poll and trigger auto-advance when timer expires
export const checkAndAdvanceIfExpired = async (req: any, res: Response) => {
	try {
		const { challengeCode } = req.body || {};
		const userId = req.user._id?.toString();
		if (!challengeCode || !userId) return res.status(400).json({ message: 'challengeCode required' });

		const baseRef = db.ref(`liveChallenges/${challengeCode}`);
		const metaSnap = await baseRef.child('meta').get();
		if (!metaSnap.exists()) return res.status(404).json({ message: 'Challenge not found' });
		const meta = metaSnap.val();
		if (meta.status !== 'in-progress') {
			return res.status(200).json({ 
				success: true, 
				needsAdvance: false, 
				status: meta.status 
			});
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
			return res.status(200).json({
				success: true,
				needsAdvance: false,
				currentIndex: idx,
				timeRemaining: Math.max(0, (current.endTime || (startTime + QUESTION_DURATION)) - now),
			});
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
			return res.status(200).json({
				success: true,
				needsAdvance: true,
				allAnswered: true,
				currentIndex: idx,
			});
		}

		// Mark unanswered participants
		const markedCount = await markUnansweredParticipants(challengeCode, idx);

		// Get questions to check if there are more
		const questionsSnap = await baseRef.child('questions').get();
		const questions = questionsSnap.val() || [];
		const total = questions.length;

		if (idx + 1 < total) {
			// Advance to next question
			const advanceTime = Date.now();
			await baseRef.child('current').set({ index: idx + 1, startTime: advanceTime, endTime: advanceTime + QUESTION_DURATION });
			await baseRef.child('meta/updatedAt').set(advanceTime);

			return res.status(200).json({
				success: true,
				needsAdvance: true,
				advanced: true,
				currentIndex: idx + 1,
				totalQuestions: total,
				unansweredCount: markedCount,
			});
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

			return res.status(200).json({
				success: true,
				needsAdvance: true,
				completed: true,
				finalRankings,
			});
		}
	} catch (err: any) {
		console.error('checkAndAdvanceIfExpired error:', err);
		return res.status(500).json({ message: 'Server error', details: err.message });
	}
};