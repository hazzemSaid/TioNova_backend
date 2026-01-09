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
        // ✅ Load from cache using helper - DISABLED as per request
        // ✅ Load from cache using helper
        const cachedQuiz = await CacheHelper.getCachedQuiz(chapterId);

        if (cachedQuiz) {
            quizId = cachedQuiz.quizId;
            quizTitle = cachedQuiz.title;
            cachedQuestions = cachedQuiz.questions;
        }

        // ✅ Load from DB if cache empty (or bypassed)
        if (cachedQuestions.length === 0) {
            // Find ALL quizzes for this chapter to pool questions
            const existingQuizzes = await QuizModel.find({ chapterId }).populate("questions");

            if (existingQuizzes.length > 0) {
                // Use the first one as reference
                quiz = existingQuizzes[0];
                quizId = quiz._id.toString();
                quizTitle = quiz.title;

                // Aggregate unique questions
                const uniqueQs = new Map();
                existingQuizzes.forEach((qz: any) => {
                    if (qz.questions) {
                        qz.questions.forEach((q: any) => {
                            if (q && q._id) uniqueQs.set(q._id.toString(), q);
                        });
                    }
                });

                cachedQuestions = Array.from(uniqueQs.values()).map((q: any) => ({
                    _id: q._id,
                    question: q.question,
                    options: q.options,
                }));

                // Cache it
                await CacheHelper.cacheQuiz(
                    chapterId,
                    { quizId: quizId as string, title: quizTitle, questions: cachedQuestions },
                    CacheKeys.TTL.ONE_DAY
                );
            }
        }

        // ✅ Generate new questions if less than 40 (target pool size)
        const TARGET_POOL_SIZE = 40;
        const RETURN_COUNT = 20;

        if (cachedQuestions.length < TARGET_POOL_SIZE) {
            const chapter = await ChapterModel.findById(chapterId);

            if (!chapter) {
                return next(ErrorHandler.createError("Chapter not found", 404));
            }

            const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;

            if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
                return next(ErrorHandler.createError("Chapter content is missing", 400));
            }

            quizTitle = chapter.title;
            const needed = TARGET_POOL_SIZE - cachedQuestions.length;
            const existingTexts = cachedQuestions.map((q) => `- ${q.question}`).join("\n");

            const systemPrompt = `You are a senior professor creating a FINAL EXAM. Generate smart, direct multiple-choice questions.

CRITICAL INSTRUCTIONS:
1. PARAPHRASE - Never copy text directly from the content. Rephrase concepts in your own words.
2. TEST UNDERSTANDING - Questions should verify the student truly understands, not just memorized text.
3. BE DIRECT - Ask clear, straightforward questions. No unnecessary complexity.
4. EXAM QUALITY - Questions must be professional, like a real university exam.

QUESTION STYLE:
- Use active voice and clear language
- Test: understanding of concepts, ability to distinguish similar terms, cause-effect relationships, practical applications
- Good: "What is the main purpose of X?" / "Which best describes Y?" / "How does A affect B?"
- Avoid: "According to..." / "The text states..." / "As mentioned..."

SMART QUESTION EXAMPLES:
- Instead of "What is photosynthesis?" → "What is the primary outcome of photosynthesis in plants?"
- Instead of copying a definition → Ask about its function, importance, or relationship to other concepts
- Test recognition of correct vs incorrect statements about key topics

REQUIREMENTS:
- ${needed} questions total
- 4 options each: a), b), c), d)
- One correct answer (a/b/c/d)
- Brief explanation (paraphrased, no quotes from source)
- All options must be plausible

SKIP IF SIMILAR TO:
${existingTexts}

OUTPUT FORMAT (JSON array only):
[{"question":"...","options":["a) ...","b) ...","c) ...","d) ..."],"answer":"a","explanation":"..."}]`;

            // ✅ Use Gemini for both text and PDF content (Unified path)
            let rawText: string;

            if (hasOvercontent) {
                // Use OpenRouter with extracted text
                const geminiPrompt = `${systemPrompt}

REFERENCE MATERIAL (use facts only, do not mention this source):
${chapter.overcontent}

Generate ${needed} exam questions now.`;

                const data = await callOpenRouterApi({
                    model: "tngtech/deepseek-r1t2-chimera:free",
                    messages: [
                        { role: 'user', content: geminiPrompt }
                    ],
                    maxOutputTokens: 5000 // Reduced to fit within credit limits
                });

                rawText = extractOpenRouterText(data);

                if (!rawText) {
                    console.error("OpenRouter Empty Response:", JSON.stringify(data, null, 2));
                    throw new Error("No response content from OpenRouter API");
                }
            } else {
                // PDF content without extracted text - OpenRouter fallback
                const base64File = chapter.content.toString("base64");
                const pdfPrompt = `${systemPrompt}\n\nProcess PDF content and generate ${needed} quiz questions.`;

                const data = await callOpenRouterApi({
                    model: "tngtech/deepseek-r1t2-chimera:free",
                    messages: [
                        {
                            role: 'user',
                            content: pdfPrompt
                        }
                    ],
                    maxOutputTokens: 5000
                });

                rawText = extractOpenRouterText(data);

                if (!rawText) {
                    throw new Error("No response content from OpenRouter API for PDF processing");
                }
            }

            // Parse output
            let newMcqs: any[] = [];
            try {
                // Remove markdown code blocks if present
                const cleanedText = rawText.replace(/```json\n?|\n?```/g, "").trim();
                newMcqs = JSON.parse(cleanedText);
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

        // ✅ Randomly pick 20 questions from the pool of 40
        const shuffled = [...cachedQuestions].sort(() => 0.5 - Math.random());
        const questionsToReturn = shuffled.slice(0, RETURN_COUNT).map((q) => ({
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
            totalQuestions: RETURN_COUNT,
            poolSize: cachedQuestions.length,
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
            const existingQuizzes = await QuizModel.find({ chapterId }).populate("questions");

            if (existingQuizzes.length > 0) {
                quiz = existingQuizzes[0];
                quizId = quiz._id.toString();
                quizTitle = quiz.title;

                // Aggregate unique questions with answers
                const uniqueQs = new Map();
                existingQuizzes.forEach((qz: any) => {
                    if (qz.questions) {
                        qz.questions.forEach((q: any) => {
                            if (q && q._id) uniqueQs.set(q._id.toString(), q);
                        });
                    }
                });

                cachedQuestions = Array.from(uniqueQs.values()).map((q: any) => ({
                    _id: q._id,
                    question: q.question,
                    options: q.options,
                    answer: q.answer,
                    explanation: q.explanation || "",
                }));

                // Cache it
                await CacheHelper.cacheQuiz(
                    chapterId,
                    { quizId: quizId as string, title: quizTitle, questions: cachedQuestions },
                    CacheKeys.TTL.ONE_DAY
                );
            }
        }

        // ✅ Generate new questions if less than 40 (target pool size)
        const TARGET_POOL_SIZE = 40;
        const RETURN_COUNT = 20;

        if (cachedQuestions.length < TARGET_POOL_SIZE) {
            const chapter = await ChapterModel.findById(chapterId);

            if (!chapter) {
                return next(ErrorHandler.createError("Chapter not found", 404));
            }

            const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;

            if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
                return next(ErrorHandler.createError("Chapter content is missing", 400));
            }

            quizTitle = chapter.title;
            const needed = TARGET_POOL_SIZE - cachedQuestions.length;
            const existingTexts = cachedQuestions.map((q) => `- ${q.question}`).join("\n");

            const systemPrompt = `You are a senior professor creating a FINAL EXAM. Generate smart, direct multiple-choice questions.

CRITICAL INSTRUCTIONS:
1. PARAPHRASE - Never copy text directly from the content. Rephrase concepts in your own words.
2. TEST UNDERSTANDING - Questions should verify the student truly understands, not just memorized text.
3. BE DIRECT - Ask clear, straightforward questions. No unnecessary complexity.
4. EXAM QUALITY - Questions must be professional, like a real university exam.

QUESTION STYLE:
- Use active voice and clear language
- Test: understanding of concepts, ability to distinguish similar terms, cause-effect relationships, practical applications
- Good: "What is the main purpose of X?" / "Which best describes Y?" / "How does A affect B?"
- Avoid: "According to..." / "The text states..." / "As mentioned..."

SMART QUESTION EXAMPLES:
- Instead of "What is photosynthesis?" → "What is the primary outcome of photosynthesis in plants?"
- Instead of copying a definition → Ask about its function, importance, or relationship to other concepts
- Test recognition of correct vs incorrect statements about key topics

REQUIREMENTS:
- ${needed} questions total
- 4 options each: a), b), c), d)
- One correct answer (a/b/c/d)
- Brief explanation (paraphrased, no quotes from source)
- All options must be plausible

SKIP IF SIMILAR TO:
${existingTexts}

OUTPUT FORMAT (JSON array only):
[{"question":"...","options":["a) ...","b) ...","c) ...","d) ..."],"answer":"a","explanation":"..."}]`;

            let rawText: string;

            if (hasOvercontent) {
                // Use OpenRouter with extracted text
                const geminiPrompt = `${systemPrompt}

REFERENCE MATERIAL (use facts only, do not mention this source):
${chapter.overcontent}

Generate ${needed} exam questions now.`;

                const data = await callOpenRouterApi({
                    model: "tngtech/deepseek-r1t2-chimera:free",
                    messages: [
                        { role: 'user', content: geminiPrompt }
                    ],
                    maxOutputTokens: 5000
                });

                rawText = extractOpenRouterText(data);

                if (!rawText) {
                    console.error("OpenRouter Empty Response:", JSON.stringify(data, null, 2));
                    throw new Error("No response content from OpenRouter API");
                }
            } else {
                // PDF content without extracted text - OpenRouter fallback
                const base64File = chapter.content.toString("base64");
                const pdfPrompt = `${systemPrompt}\n\nProcess PDF content and generate ${needed} quiz questions.`;

                const data = await callOpenRouterApi({
                    model: "tngtech/deepseek-r1t2-chimera:free",
                    messages: [
                        {
                            role: 'user',
                            content: pdfPrompt
                        }
                    ],
                    maxOutputTokens: 5000
                });

                rawText = extractOpenRouterText(data);

                if (!rawText) {
                    throw new Error("No response content from OpenRouter API for PDF processing");
                }
            }

            // Parse output
            let newMcqs: any[] = [];
            try {
                const cleanedText = rawText.replace(/```json\n?|\n?```/g, "").trim();
                newMcqs = JSON.parse(cleanedText);
            } catch {
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

        // ✅ Randomly pick 20 questions from the pool of 40 for practice mode
        const shuffled = [...cachedQuestions].sort(() => 0.5 - Math.random());
        const questionsToReturn = shuffled.slice(0, RETURN_COUNT).map((q) => ({
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
            totalQuestions: RETURN_COUNT,
            poolSize: cachedQuestions.length,
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
