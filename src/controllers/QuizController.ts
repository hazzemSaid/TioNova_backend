import mongoose from "mongoose";
import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import QuestionModel from "../models/QuestionModel";
import QuizModel from "../models/QuizModel";
import UserQuizStatusModel from "../models/UserQuizStatusModel";
import { AnalysisService } from "../services/analysisService";
import { ProfileService } from "../services/profileService";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";
import { getMimeType, retryGeminiApiCall } from "../utils/geminiApi";
import { callOpenRouterApi, extractOpenRouterText } from "../utils/openRouterApi";

const createquiz = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.body;

    if (!chapterId) {
        return next(ErrorHandler.createError("chapterId is required", 400));
    }

    let quiz: any = null;
    let cachedQuestions: any[] = [];
    let quizId: string | null = null;
    let quizTitle: string = "";

    try {
        // ✅ Load from cache using helper
        const cachedQuiz = await CacheHelper.getCachedQuiz(chapterId);

        if (cachedQuiz) {
            quizId = cachedQuiz.quizId;
            quizTitle = cachedQuiz.title;
            cachedQuestions = cachedQuiz.questions;
        }

        // ✅ Load from DB if cache empty
        if (cachedQuestions.length === 0) {
            const existingQuiz = await QuizModel.findOne({ chapterId }).populate("questions");

            if (existingQuiz) {
                quiz = existingQuiz;
                quizId = existingQuiz._id.toString();
                quizTitle = existingQuiz.title;
                cachedQuestions = existingQuiz.questions.map((q: any) => ({
                    _id: q._id,
                    question: q.question,
                    options: q.options,
                }));

                // Cache it
                await CacheHelper.cacheQuiz(
                    chapterId,
                    { quizId, title: quizTitle, questions: cachedQuestions },
                    CacheKeys.TTL.ONE_DAY
                );
            }
        }

        // ✅ Generate new questions if less than 50
        if (cachedQuestions.length < 50) {
            const chapter = await ChapterModel.findById(chapterId);

            if (!chapter) {
                return next(ErrorHandler.createError("Chapter not found", 404));
            }

            const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;

            if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
                return next(ErrorHandler.createError("Chapter content is missing", 400));
            }

            quizTitle = chapter.title;
            const needed = 50 - cachedQuestions.length;
            const existingTexts = cachedQuestions.map((q) => `- ${q.question}`).join("\n");

            const systemPrompt = `Role: Expert Exam Preparer AI. Task: Create exactly ${needed} high-quality, exam-style multiple-choice questions based ONLY on the provided chapter content to ensure comprehensive coverage.

Strategy for "Smart" Generation:
1. Comprehensive Coverage: Scan the entire text to identify ALL key concepts, definitions, figures, and critical details.
2. Exam Focus: Prioritize information likely to be tested (e.g., "What is...", "Why does...", "How to...", distinctions between concepts).
3. Difficulty Variety: Mix simple recall questions with conceptual application questions.
4. Distractor Quality: Options b, c, and d must be plausible but clearly incorrect based on the text.

Constraints:
1. Source Material: Use ONLY the provided chapter content. Do NOT use external knowledge.
2. Uniqueness: Strictly avoid duplicating or rephrasing these existing questions:
${existingTexts}
3. Quantity: Generate exactly ${needed} questions.
4. Output: VALID JSON ARRAY ONLY. No markdown formatting, no code blocks, no intro/outro text.

Question Format:
- "question": Professional, clear, exam-style syntax.
- "options": Array of 4 strings, labeled "a)", "b)", "c)", "d)".
- "answer": The correct option letter ("a", "b", "c", or "d").
- "explanation": Concise justification referencing the specific part of the text.

Example Output:
[
  {
    "question": "Which of the following best describes the function of X?",
    "options": ["a) Definition 1", "b) Definition 2", "c) Definition 3", "d) Definition 4"],
    "answer": "a",
    "explanation": "The text defines X as..."
  }
]`;
            let rawText: string;

            // ✅ Use OpenRouter if overcontent exists, otherwise fallback to Gemini
            if (hasOvercontent) {
                const openRouterResponse = await callOpenRouterApi({
                    model: 'nvidia/nemotron-3-nano-30b-a3b:free',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Chapter Content:\n${chapter.overcontent}\n\nGenerate ${needed} quiz questions from this content.` }
                    ],
                    temperature: 0.7
                });
                rawText = extractOpenRouterText(openRouterResponse);
            } else {
                // Fallback to Gemini for PDF content
                const base64File = chapter.content.toString("base64");
                const mimeType = getMimeType("chapter.pdf", chapter.contentType);
                const geminiPrompt = `${systemPrompt}\n\nChapter Content in the attached PDF.\n\nGenerate ${needed} quiz questions from the PDF content.`;

                const requestBody = {
                    contents: [{
                        parts: [
                            { text: geminiPrompt },
                            { inlineData: { mimeType, data: base64File } }
                        ]
                    }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
                };

                const response = await retryGeminiApiCall(requestBody);
                const data = await response.json();
                rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            }

            // Parse output
            let newMcqs: any[] = [];
            try {
                newMcqs = JSON.parse(rawText);
            } catch {
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

            // Filter and validate
            newMcqs = newMcqs.filter(
                (mcq) =>
                    mcq.question &&
                    Array.isArray(mcq.options) &&
                    mcq.options.length === 4 &&
                    ["a", "b", "c", "d"].includes(mcq.answer?.toLowerCase())
            ).slice(0, needed);

            // Ensure quiz exists
            if (!quiz) {
                quiz = await QuizModel.findOne({ chapterId }) ||
                    await QuizModel.create({
                        chapterId,
                        title: chapter.title,
                        questions: [],
                        createdBy: req.user._id,
                        updatedBy: req.user._id,
                    });
                quizId = quiz._id.toString();
            }

            // Save new questions
            const questionDocs = await QuestionModel.insertMany(
                newMcqs.map((mcq) => ({
                    quizId: quiz._id,
                    question: mcq.question,
                    options: mcq.options,
                    answer: mcq.answer.toLowerCase(),
                    explanation: mcq.explanation,
                    createdBy: req.user._id,
                    updatedBy: req.user._id,
                }))
            );

            quiz.questions.push(...questionDocs.map((q) => q._id));
            await quiz.save();

            cachedQuestions.push(
                ...questionDocs.map((q) => ({
                    _id: q._id,
                    question: q.question,
                    options: q.options,
                }))
            );

            // ✅ Update cache
            await CacheHelper.cacheQuiz(
                chapterId,
                { quizId: quiz._id.toString(), title: quizTitle, questions: cachedQuestions },
                CacheKeys.TTL.ONE_DAY
            );
        }

        // Get quiz if not loaded
        if (!quiz && quizId) {
            quiz = await QuizModel.findById(quizId);
        }

        // ✅ Randomly pick 40 questions
        const shuffled = [...cachedQuestions].sort(() => 0.5 - Math.random());
        const questionsToReturn = shuffled.slice(0, 40).map((q) => ({
            _id: q._id,
            question: q.question,
            options: q.options,
        }));

        res.status(200).json({
            success: true,
            message: "Quiz retrieved/generated successfully",
            quiz: {
                _id: quiz?._id || quizId,
                title: quiz?.title || quizTitle,
                questions: questionsToReturn,
            },
            totalQuestions: 15,
        });
    } catch (error) {
        console.error("Error creating quiz:", error);
        return next(ErrorHandler.createError("Failed to create quiz", 500));
    }
});

const getchapterquiz = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const chapter = await ChapterModel.findById(chapterId);

    if (!chapter) {
        return next(ErrorHandler.createError("Chapter not found", 404));
    }

    const quiz = await QuizModel.findOne({ chapterId: chapter._id });

    if (!quiz) {
        return next(ErrorHandler.createError("Quiz not found", 404));
    }

    res.status(200).json({
        success: true,
        message: "Quiz retrieved successfully",
        quiz,
    });
});

const getQuizQuestions = asyncWrapper(async (req, res, next) => {
    const { quizId } = req.params;
    const quiz = await QuizModel.findById(quizId);

    if (!quiz) {
        return next(ErrorHandler.createError("Quiz not found", 404));
    }

    const questions: any = [];
    for (let i = 0; i < quiz.questions.length; i++) {
        const question = await QuestionModel.findById(quiz.questions[i]);
        if (!question) {
            return next(ErrorHandler.createError("Question not found", 404));
        }
        questions.push(question);
    }

    res.status(200).json({
        success: true,
        message: "Questions retrieved successfully",
        questions,
    });
});

const setUserQuizStatus = asyncWrapper(async (req, res, next) => {
    const userId = req.user._id;
    const { quizId, chapterId, answers, timeTaken } = req.body || {};

    if (!quizId) {
        return next(ErrorHandler.createError("quizId is required", 400));
    }

    if (!chapterId) {
        return next(ErrorHandler.createError("chapterId is required", 400));
    }

    if (!Array.isArray(answers) || answers.length === 0) {
        return next(ErrorHandler.createError("answers must be a non-empty array", 400));
    }

    const quiz = await QuizModel.findById(quizId);
    if (!quiz) {
        return next(ErrorHandler.createError("Quiz not found", 404));
    }

    if (quiz.chapterId.toString() !== chapterId.toString()) {
        return next(
            ErrorHandler.createError("quizId does not belong to provided chapterId", 400)
        );
    }

    // Load all quiz questions
    const questionIds = quiz.questions.map(
        (qId: any) => new mongoose.Types.ObjectId(qId)
    );
    const questions = await QuestionModel.find({ _id: { $in: questionIds } });
    const questionIdToDoc: Record<string, any> = {};
    for (const q of questions) {
        questionIdToDoc[q._id.toString()] = q;
    }

    // Normalize and grade answers
    const gradedAnswers: Array<{
        questionId: any;
        selectedOption: string;
        isCorrect: boolean;
        correctAnswer?: string;
        explanation?: string;
        question?: string;
        options?: string[];
    }> = [];

    let correctCount = 0;
    for (const a of answers) {
        const qId = a.questionId || a.quetionid;
        const selected = (a.answer || "").toString().trim().toLowerCase();
        if (!qId || !selected) continue;

        const qDoc = questionIdToDoc[qId.toString()];
        if (!qDoc) continue;

        const correct = (qDoc.answer || "").toString().trim().toLowerCase();
        const isCorrect = selected === correct;
        if (isCorrect) correctCount += 1;

        gradedAnswers.push({
            questionId: new mongoose.Types.ObjectId(qDoc._id),
            selectedOption: selected,
            isCorrect,
            correctAnswer: correct,
            explanation: (qDoc as any).explanation || "",
            question: qDoc.question,
            options: qDoc.options,
        });
    }

    // Calculate score based on answered questions, not total questions in quiz
    const totalAnswered = gradedAnswers.length;
    const scorePercent =
        totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    const passThreshold = 70;
    const status = scorePercent >= passThreshold ? "Passed" : "Failed";

    // Upsert user quiz status with a new attempt
    const attempt = {
        timeTaken,
        startedAt: new Date(),
        completedAt: new Date(),
        answers: gradedAnswers,
    } as any;

    const userQuizStatus = await UserQuizStatusModel.findOneAndUpdate(
        { userId, quizId, chapterId },
        {
            $set: { status, score: scorePercent },
            $push: { attempts: attempt },
        },
        { new: true, upsert: true }
    );

    // ✅ Update analysis: average score
    try {
        console.log(`[QuizController] Updating profile for user ${userId}, score ${scorePercent}, time ${timeTaken}s`);
        await AnalysisService.updateAvgScore(userId.toString(), scorePercent);
        await ProfileService.incrementQuizzesTaken(userId.toString(), {
            chapterId: chapterId.toString(),
            timeTaken
        });
        await ProfileService.updateAverageQuizScore(userId.toString(), scorePercent);
        await ProfileService.updateStreak(userId.toString());

        // ✅ Invalidate folder cache to update attemptedCount/passedCount
        const chapter = await ChapterModel.findById(chapterId);
        if (chapter) {
            const folder = await FolderModel.findById(chapter.folderId);
            if (folder) {
                const affectedUsers = [
                    folder.ownerId.toString(),
                    ...(folder.sharedWith || []).map((id: any) => id.toString()),
                ];
                await Promise.all(
                    affectedUsers.map(uid => CacheHelper.invalidateUserFolders(uid))
                );
                console.log(`[QuizController] Invalidated folder cache for ${affectedUsers.length} users`);
            }
        }

        console.log(`[QuizController] ✅ Profile and Cache updated successfully`);
    } catch (e) {
        console.error("❌ [QuizController] CRITICAL ERROR updating analysis/profile/cache:");
        console.error(e);
        console.error((e as Error).stack);
    }

    // Get updated profile with new streak
    const updatedProfile = await ProfileService.getProfile(userId.toString());

    return res.status(200).json({
        success: true,
        message: "Quiz graded successfully",
        result: {
            totalQuestions: totalAnswered,
            correct: correctCount,
            score: scorePercent,
            status,
            gradedAnswers,
        },
        userQuizStatus,
        profile: {
            streak: updatedProfile?.streak || 0,
            totalQuizzesTaken: updatedProfile?.totalQuizzesTaken || 0,
            averageQuizScore: updatedProfile?.averageQuizScore || 0
        }
    });
});

const quizhistory = asyncWrapper(async (req, res, next) => {
    const userId = req.user._id;
    const { chapterId } = req.body || {};

    if (!chapterId) {
        return next(ErrorHandler.createError("chapterId is required", 400));
    }

    const cacheKey = CacheKeys.getUserQuizHistoryKey(userId, chapterId);
    const cachedHistory = await CacheHelper.get(cacheKey);

    if (cachedHistory) {
        return res.status(200).json({
            success: true,
            message: "Quiz history retrieved from cache",
            history: cachedHistory,
            cached: true,
        });
    }

    const statusDocs = await UserQuizStatusModel.find({
        userId,
        chapterId,
    }).populate({
        path: "attempts.answers.questionId",
        model: "Question",
        select: "question options answer",
    });

    // Check if array is empty
    if (!statusDocs || statusDocs.length === 0) {
        return res.status(200).json({
            success: true,
            message: "No attempts found",
            history: {
                attempts: [],
                overallStatus: "NotTaken",
                overallScore: 0,
                totalAttempts: 0,
                bestScore: 0,
                averageScore: 0,
                passRate: 0,
            },
        });
    }

    const passThreshold = 70;

    // Flatten all attempts from all status documents
    const allAttempts = statusDocs.flatMap(
        (status: any) => status.attempts || []
    );

    // Compute per-attempt score (degree) and state
    const attemptsWithDegree = allAttempts.map((attempt: any) => {
        const answers = attempt.answers || [];
        let correctCount = 0;

        for (const a of answers) {
            const qDoc = a.questionId;
            const correct = (qDoc?.answer || "").toString().trim().toLowerCase();
            const selected = (a.selectedOption || "").toString().trim().toLowerCase();
            if (selected === correct) correctCount += 1;
        }

        const total = answers.length;
        const degree = total > 0 ? Math.round((correctCount / total) * 100) : 0;
        const state = degree >= passThreshold ? "Passed" : "Failed";

        return {
            startedAt: attempt.startedAt,
            completedAt: attempt.completedAt,
            totalQuestions: total,
            timeTaken: attempt.timeTaken,
            correct: correctCount,
            degree,
            state,
            answers: answers.map((a: any) => ({
                question: a.questionId?.question,
                options: a.questionId?.options,
                correctAnswer: a.questionId?.answer,
                selectedOption: a.selectedOption,
                isCorrect: a.isCorrect,
            })),
        };
    });

    // Aggregate stats
    const totalAttempts = attemptsWithDegree.length;
    const bestScore =
        totalAttempts > 0
            ? Math.max(...attemptsWithDegree.map((a) => a.degree))
            : 0;
    const averageScore =
        totalAttempts > 0
            ? Math.round(
                attemptsWithDegree.reduce((s, a) => s + a.degree, 0) / totalAttempts
            )
            : 0;
    const passCount = attemptsWithDegree.filter(
        (a) => a.state === "Passed"
    ).length;
    const passRate =
        totalAttempts > 0 ? Math.round((passCount / totalAttempts) * 100) : 0;

    // Use the most recent status document or aggregate status
    const latestStatusDoc = statusDocs[statusDocs.length - 1];
    const historyData = {
        attempts: attemptsWithDegree,
        overallStatus: latestStatusDoc.status,
        overallScore: latestStatusDoc.score,
        totalAttempts,
        bestScore,
        averageScore,
        passRate,
    };

    await CacheHelper.set(cacheKey, historyData, CacheKeys.TTL.ONE_HOUR);

    return res.status(200).json({
        success: true,
        message: "Quiz history retrieved successfully",
        history: historyData,
    });
});

const practiceMode = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.body;

    if (!chapterId) {
        return next(ErrorHandler.createError("chapterId is required", 400));
    }

    let quiz: any = null;
    let cachedQuestions: any[] = [];
    let quizId: string | null = null;
    let quizTitle: string = "";

    try {
        // ✅ Load from cache using helper
        const cachedQuiz = await CacheHelper.getCachedQuiz(chapterId);

        if (cachedQuiz) {
            quizId = cachedQuiz.quizId;
            quizTitle = cachedQuiz.title;
            cachedQuestions = cachedQuiz.questions;
        }

        // ✅ Load from DB if cache empty - include answer and explanation for practice mode
        if (cachedQuestions.length === 0) {
            const existingQuiz = await QuizModel.findOne({ chapterId }).populate("questions");

            if (existingQuiz) {
                quiz = existingQuiz;
                quizId = existingQuiz._id.toString();
                quizTitle = existingQuiz.title;
                cachedQuestions = existingQuiz.questions.map((q: any) => ({
                    _id: q._id,
                    question: q.question,
                    options: q.options,
                    answer: q.answer,
                    explanation: q.explanation || "",
                }));
            }
        }

        // ✅ Generate new questions if less than 50
        if (cachedQuestions.length < 50) {
            const chapter = await ChapterModel.findById(chapterId);

            if (!chapter) {
                return next(ErrorHandler.createError("Chapter not found", 404));
            }

            const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;

            if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
                return next(ErrorHandler.createError("Chapter content is missing", 400));
            }

            quizTitle = chapter.title;
            const needed = 50 - cachedQuestions.length;
            const existingTexts = cachedQuestions.map((q) => `- ${q.question}`).join("\n");

            const systemPrompt = `Role: Expert Exam Preparer AI. Task: Create exactly ${needed} high-quality, exam-style multiple-choice questions based ONLY on the provided chapter content to ensure comprehensive coverage.

Strategy for "Smart" Generation:
1. Comprehensive Coverage: Scan the entire text to identify ALL key concepts, definitions, figures, and critical details.
2. Exam Focus: Prioritize information likely to be tested (e.g., "What is...", "Why does...", "How to...", distinctions between concepts).
3. Difficulty Variety: Mix simple recall questions with conceptual application questions.
4. Distractor Quality: Options b, c, and d must be plausible but clearly incorrect based on the text.

Constraints:
1. Source Material: Use ONLY the provided chapter content. Do NOT use external knowledge.
2. Uniqueness: Strictly avoid duplicating or rephrasing these existing questions:
${existingTexts}
3. Quantity: Generate exactly ${needed} questions.
4. Output: VALID JSON ARRAY ONLY. No markdown formatting, no code blocks, no intro/outro text.

Question Format:
- "question": Professional, clear, exam-style syntax.
- "options": Array of 4 strings, labeled "a)", "b)", "c)", "d)".
- "answer": The correct option letter ("a", "b", "c", or "d").
- "explanation": Concise justification referencing the specific part of the text.

Example Output:
[
  {
    "question": "Which of the following best describes the function of X?",
    "options": ["a) Definition 1", "b) Definition 2", "c) Definition 3", "d) Definition 4"],
    "answer": "a",
    "explanation": "The text defines X as..."
  }
]`;

            let rawText: string;

            // ✅ Use OpenRouter if overcontent exists, otherwise fallback to Gemini
            if (hasOvercontent) {
                const openRouterResponse = await callOpenRouterApi({
                    model: 'nvidia/nemotron-3-nano-30b-a3b:free',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Chapter Content:\n${chapter.overcontent}\n\nGenerate ${needed} quiz questions from this content.` }
                    ],
                    temperature: 0.7
                });
                rawText = extractOpenRouterText(openRouterResponse);
            } else {
                // Fallback to Gemini for PDF content
                const base64File = chapter.content.toString("base64");
                const mimeType = getMimeType("chapter.pdf", chapter.contentType);
                const geminiPrompt = `${systemPrompt}\n\nChapter Content in the attached PDF.\n\nGenerate ${needed} quiz questions from the PDF content.`;

                const requestBody = {
                    contents: [{
                        parts: [
                            { text: geminiPrompt },
                            { inlineData: { mimeType, data: base64File } }
                        ]
                    }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
                };

                const response = await retryGeminiApiCall(requestBody);
                const data = await response.json();
                rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            }

            // Parse output
            let newMcqs: any[] = [];
            try {
                newMcqs = JSON.parse(rawText);
            } catch {
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

            // Filter and validate
            newMcqs = newMcqs.filter(
                (mcq) =>
                    mcq.question &&
                    Array.isArray(mcq.options) &&
                    mcq.options.length === 4 &&
                    ["a", "b", "c", "d"].includes(mcq.answer?.toLowerCase())
            ).slice(0, needed);

            // Ensure quiz exists
            if (!quiz) {
                quiz = await QuizModel.findOne({ chapterId }) ||
                    await QuizModel.create({
                        chapterId,
                        title: chapter.title,
                        questions: [],
                        createdBy: req.user._id,
                        updatedBy: req.user._id,
                    });
                quizId = quiz._id.toString();
            }

            // Save new questions
            const questionDocs = await QuestionModel.insertMany(
                newMcqs.map((mcq) => ({
                    quizId: quiz._id,
                    question: mcq.question,
                    options: mcq.options,
                    answer: mcq.answer.toLowerCase(),
                    explanation: mcq.explanation,
                    createdBy: req.user._id,
                    updatedBy: req.user._id,
                }))
            );

            quiz.questions.push(...questionDocs.map((q) => q._id));
            await quiz.save();

            cachedQuestions.push(
                ...questionDocs.map((q) => ({
                    _id: q._id,
                    question: q.question,
                    options: q.options,
                    answer: q.answer,
                    explanation: q.explanation || "",
                }))
            );
        }

        // Get quiz if not loaded
        if (!quiz && quizId) {
            quiz = await QuizModel.findById(quizId);
        }

        // ✅ For practice mode: get full question details from DB if we only have partial data
        if (cachedQuestions.length > 0 && !cachedQuestions[0].answer) {
            const questionIds = cachedQuestions.map(q => q._id);
            const fullQuestions = await QuestionModel.find({ _id: { $in: questionIds } });
            cachedQuestions = fullQuestions.map((q: any) => ({
                _id: q._id,
                question: q.question,
                options: q.options,
                answer: q.answer,
                explanation: q.explanation || "",
            }));
        }

        // ✅ Randomly pick 30 questions for practice mode
        const shuffled = [...cachedQuestions].sort(() => 0.5 - Math.random());
        const questionsToReturn = shuffled.slice(0, 30).map((q) => ({
            _id: q._id,
            question: q.question,
            options: q.options,
            answer: q.answer,
            explanation: q.explanation || "",
        }));

        res.status(200).json({
            success: true,
            message: "Practice mode questions retrieved successfully",
            quiz: {
                _id: quiz?._id || quizId,
                title: quiz?.title || quizTitle,
                questions: questionsToReturn,
            },
            totalQuestions: 30,
        });
    } catch (error) {
        console.error("Error in practice mode:", error);
        return next(ErrorHandler.createError("Failed to get practice mode questions", 500));
    }
});

const QuizController = {
    createquiz,
    getchapterquiz,
    getQuizQuestions,
    setUserQuizStatus,
    quizhistory,
    practiceMode,
};

export default QuizController;
