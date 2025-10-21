import mongoose from "mongoose";
import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import QuestionModel from "../models/QuestionModel";
import QuizModel from "../models/QuizModel";
import UserQuizStatusModel from "../models/UserQuizStatusModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";
import { getMimeType, retryGeminiApiCall } from "../utils/geminiApi";

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
            
            if (!chapter || (!chapter.overcontent && !Buffer.isBuffer(chapter.content))) {
                return next(ErrorHandler.createError("Chapter content is required", 400));
            }

            quizTitle = chapter.title;
            const needed = 50 - cachedQuestions.length;
            const existingTexts = cachedQuestions.map((q) => `- ${q.question}`).join("\n");

            const mcqPrompt = `
You are an AI assistant that creates multiple choice quizzes based on educational content.

IMPORTANT INSTRUCTIONS:
1. Read and analyze the provided chapter content carefully (PDF or text)
2. Generate exactly ${needed} new questions ONLY from the information contained in this specific chapter
3. Questions must be directly related to the topics, concepts, and information present in the chapter content
4. Do NOT create generic questions or questions from outside knowledge
5. Each question should test understanding of specific content from the chapter
6. Do NOT repeat any of the questions listed below

Existing questions to avoid:
${existingTexts}

Requirements for each question:
- Must be answerable using only information from the chapter
- Should test key concepts, facts, or principles from the content
- Include 4 distinct options (labeled a, b, c, d)
- Only one option should be correct
- Provide a clear explanation referencing the chapter content

Output Format (JSON only, no additional text):
[
  {
    "question": "Your question text based on chapter content?",
    "options": ["a) Option1", "b) Option2", "c) Option3", "d) Option4"],
    "answer": "a",
    "explanation": "Brief explanation referencing the chapter content."
  }
]
`;

            const contents: any[] = [{ parts: [{ text: mcqPrompt }] }];
            
            if (!chapter.overcontent) {
                const base64File = chapter.content.toString("base64");
                const mimeType = getMimeType("chapter.pdf", chapter.contentType);
                contents[0].parts.push({ 
                    inlineData: { mimeType, data: base64File } 
                });
            } else {
                // If overcontent exists, include it in the prompt
                contents[0].parts.push({ 
                    text: `\n\nChapter Content:\n${chapter.overcontent}` 
                });
            }

            const requestBody = {
                contents,
                generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
            };

            const response = await retryGeminiApiCall(requestBody);
            const data = await response.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

            // Parse Gemini output
            let newMcqs: any[] = [];
            try {
                newMcqs = JSON.parse(rawText);
            } catch {
                try {
                    const { jsonrepair } = require("jsonrepair");
                    newMcqs = JSON.parse(jsonrepair(rawText));
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

        // ✅ Randomly pick 15 questions
        const shuffled = [...cachedQuestions].sort(() => 0.5 - Math.random());
        const questionsToReturn = shuffled.slice(0, 15).map((q) => ({
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

    const totalQuestions = questions.length;
    const scorePercent =
        totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
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

    return res.status(200).json({
        success: true,
        message: "Quiz graded successfully",
        result: {
            totalQuestions: 15,
            correct: correctCount,
            score: scorePercent,
            status,
            gradedAnswers,
        },
        userQuizStatus,
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

const QuizController = {
    createquiz,
    getchapterquiz,
    getQuizQuestions,
    setUserQuizStatus,
    quizhistory,
};

export default QuizController;
