import Fuse from "fuse.js";
import mongoose from "mongoose";
import NodeCache from "node-cache";
import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import QuestionModel from "../models/QuestionModel";
import QuizModel from "../models/QuizModel";
import SummaryModel from "../models/SummaryModel";
import UserModel from "../models/UserModel";
import UserQuizStatusModel from "../models/UserQuizStatusModel";
import ErrorHandler from "../utils/error";
const userSearchCache = new NodeCache({ stdTTL: 300 }); // 5 min TTL

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { jsonrepair } = require("jsonrepair");
const createfolder = asyncWrapper(async (req, res, next) => {
    const { title, description, status, category, color, icon, sharedWith } =
        req.body;
    const folder = await FolderModel.create({
        title: title,
        category: category,
        description: description,
        ownerId: req.user._id,
        status: status,
        icon: icon,
        color: color,
        sharedWith: sharedWith,
    });
    // Always return sharedWith as array of {_id, username, email, profilePicture}
    let sharedWithUsers: any = [];
    try {
        if (Array.isArray(folder.sharedWith) && folder.sharedWith.length > 0) {
            sharedWithUsers = await UserModel.find({ _id: { $in: folder.sharedWith } })
                .select('_id username email profilePicture')
                .lean();
        }
    } catch (err) {
        sharedWithUsers = [];
    }
    // SSE: Notify owner and shared users
    try {
        const { sendEventToUser } = require("./sseController");
        // Notify owner
        sendEventToUser(req.user._id.toString(), {
            type: "folder_created",
            folder: {
                ...folder.toObject(),
                sharedWith: sharedWithUsers,
            },
        });
        // Notify shared users
        if (Array.isArray(sharedWith)) {
            sharedWith.forEach((uid: any) => {
                sendEventToUser(uid.toString(), {
                    type: "folder_shared_created",
                    folder: {
                        ...folder.toObject(),
                        sharedWith: sharedWithUsers,
                    },
                });
            });
        }
    } catch (err) {
        // Ignore SSE errors
    }
    res.status(200).json({
        success: true,
        message: "Folder created successfully",
        folder: {
            ...folder.toObject(),
            sharedWith: sharedWithUsers,
        },
    });
});
const createchapter = asyncWrapper(async (req, res, next) => {
    //wrapper with token verification
    const { folderId, title, description, category } = req.body;
    const file = req.file;
    if (!file) {
        return next(ErrorHandler.createError("PDF file is required", 400));
    }
    if (file.mimetype !== "application/pdf") {
        return next(ErrorHandler.createError("PDF file is required", 400));
    }
    const chapter = await ChapterModel.create({
        content: file.buffer,
        contentType: file.mimetype,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        folderId: folderId,
        title: title,
        description: description,
        category: category,
    });
    // const pdf = await pdfService.uploadpdf(file);
    res.status(200).json({
        success: true,
        message: "Chapter created successfully",
    });
});
const summarizecchapter = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.body;
    if (!chapterId) {
        return next(ErrorHandler.createError("chapterId is required", 400));
    }

    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) {
        return next(ErrorHandler.createError("Chapter not found", 404));
    }

    // CHECK CACHE: If summary already exists for this chapter, return it
    if (chapter.summaryId) {
        const existingSummary = await SummaryModel.findById(chapter.summaryId);
        if (existingSummary) {
            return res.status(200).json({
                success: true,
                message: "Chapter summary retrieved from cache",
                summary: existingSummary.summary,
                summaryModel: existingSummary,
                cached: true,
            });
        }
    }

    if (!chapter.content || !Buffer.isBuffer(chapter.content)) {
        return next(
            ErrorHandler.createError("Chapter content is missing or invalid", 400)
        );
    }

    // Prepare Gemini API request
    const { retryGeminiApiCall, getMimeType } = require("../utils/geminiApi");
    const base64File = chapter.content.toString("base64");
    const mimeType = getMimeType("chapter.pdf", chapter.contentType);
    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: `You are a highly detailed academic assistant that **converts educational PDFs into structured JSON**.
      
      Task:
      - Carefully analyze the provided PDF content.
      - Output **only valid JSON** strictly following the schema below.
      - Do not include any text, markdown, comments, or explanations outside the JSON.
      - The output must be **directly parseable JSON** (no errors, no trailing commas).
      
      Schema:
      
      {
        "key_concepts": [
          {
            "title": "Concise concept title",
            "text": "Detailed explanation in 5–8 academic sentences. The text should highlight definitions, theory, context, and connections to related concepts.",
            "tags": ["keyword1", "keyword2", "keyword3"],
            "difficulty_level": "easy | medium | hard"
          }
        ],
        "examples": [
          {
            "concept": "Reference to related concept title",
            "example": "Worked-out example with step-by-step reasoning, using real numbers, equations, or problem-solving steps.",
            "notes": "Optional practical insight, clarification, or common mistake in one short sentence."
          }
        ],
        "professional_implications": [
          {
            "title": "Relevant professional field (e.g., Engineering, Medicine, Computer Science, Business)",
            "text": "In-depth explanation of how the concept is used in real-world practice, why it matters, and its implications in that field."
          }
        ]
      }
      
      Guidelines:
      - Always include at least 3–5 key_concepts.
      - Provide at least 2 examples (with real calculations, step-by-step if possible).
      - Each professional_implication should connect theory to real-world professional impact.
      - Ensure the tone is formal, academic, and precise.
      - Never output empty arrays: if no data, omit that section completely.
      - Never output markdown, code fences, or explanations — only the JSON object.
      
      Now process the following PDF content:`,
                    },
                    { inlineData: { mimeType, data: base64File } },
                ],
            },
        ],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    };

    const response = await retryGeminiApiCall(requestBody);
    const data = await response.json();
    let summaryJson;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    try {
        summaryJson = JSON.parse(rawText);
    } catch (e) {
        try {
            summaryJson = JSON.parse(jsonrepair(rawText));
        } catch (e2) {
            return next(ErrorHandler.createError((e2 as any).toString(), 400));
        }
    }

    // Ensure the summary matches the required structure
    const mappedSummary = {
        key_concepts: Array.isArray(summaryJson?.key_concepts)
            ? summaryJson.key_concepts
            : [],
        examples: Array.isArray(summaryJson?.examples) ? summaryJson.examples : [],
        professional_implications: Array.isArray(
            summaryJson?.professional_implications
        )
            ? summaryJson.professional_implications
            : [],
    };

    // If Gemini output contains the required keys, save and return
    if (
        Array.isArray(summaryJson?.key_concepts) &&
        Array.isArray(summaryJson?.examples) &&
        Array.isArray(summaryJson?.professional_implications)
    ) {
        const summaryModel = await SummaryModel.create({
            chapterId: chapterId,
            summary: summaryJson,
            createdBy: req.user._id,
            updatedBy: req.user._id,
        });

        chapter.summaryId = summaryModel._id;
        await chapter.save();

        return res.status(200).json({
            success: true,
            message: "Chapter summarized successfully",
            summary: summaryJson,
            summaryModel: summaryModel,
            cached: false,
        });
    }

    // Fallback: try to extract JSON from markdown code block or repair
    let rawJson = {};
    let cleanedText = rawText;
    const codeBlockMatch = cleanedText.match(/```json\s*([\s\S]*?)```/i);
    if (codeBlockMatch) {
        cleanedText = codeBlockMatch[1];
    }

    try {
        rawJson = JSON.parse(cleanedText);
    } catch (e) {
        try {
            rawJson = JSON.parse(jsonrepair(cleanedText));
        } catch (e2) {
            rawJson = { raw: rawText };
        }
    }

    return res.status(200).json({
        success: false,
        message:
            "Gemini did not generate a valid summary. See raw response for troubleshooting.",
        rawGeminiResponse: rawJson,
    });
});

const createquiz = asyncWrapper(async (req, res, next) => {
    console.log("=== CREATE QUIZ START ===");
    console.log("Request body:", req.body);
    console.log("User ID:", req.user?._id);

    const { chapterId } = req.body;

    try {
        if (!chapterId)
            return next(ErrorHandler.createError("chapterId is required", 400));

        const chapter = await ChapterModel.findById(chapterId);
        if (!chapter)
            return next(ErrorHandler.createError("Chapter not found", 404));

        // CHECK CACHE: Look for existing quiz for this chapter
        const existingQuiz = await QuizModel.findOne({ chapterId }).populate({
            path: "questions",
            select: "question options answer explanation createdAt updatedAt",
        });

        if (
            existingQuiz &&
            existingQuiz.questions &&
            existingQuiz.questions.length > 0
        ) {
            const totalCachedQuestions = existingQuiz.questions.length;

            // If cached quiz has 50+ questions, return random 15
            if (totalCachedQuestions >= 50) {
                const shuffled = [...existingQuiz.questions].sort(
                    () => 0.5 - Math.random()
                );
                const selectedQuestions = shuffled.slice(0, 15);

                return res.status(200).json({
                    success: true,
                    message: "Quiz retrieved from cache (random selection)",
                    quiz: {
                        ...existingQuiz.toObject(),
                        questions: selectedQuestions,
                    },
                    totalQuestions: selectedQuestions.length,
                    totalCachedQuestions: totalCachedQuestions,
                    cached: true,
                });
            }

            // If cached quiz has less than 50 questions, return all with option to generate more
            return res.status(200).json({
                success: true,
                message: "Quiz retrieved from cache",
                quiz: existingQuiz,
                totalQuestions: totalCachedQuestions,
                totalCachedQuestions: totalCachedQuestions,
                cached: true,
                canGenerateMore: true,
            });
        }

        // No cache found, generate new quiz
        if (!chapter.content || !Buffer.isBuffer(chapter.content)) {
            return next(ErrorHandler.createError("Chapter content is required", 400));
        }

        const { retryGeminiApiCall, getMimeType } = require("../utils/geminiApi");
        const base64File = chapter.content.toString("base64");
        const mimeType = getMimeType("chapter.pdf", chapter.contentType);

        const mcqPrompt = `
        You are an assistant that creates quizzes.
        
        Task:
        Generate **exactly 50 multiple choice questions** from the provided PDF to build a comprehensive question bank.
        
        Format:
        [
          {
            "question": "Clear question text?",
            "options": ["a) Option 1", "b) Option 2", "c) Option 3", "d) Option 4"],
            "answer": "a",
            "explanation": "Short explanation why this is correct."
          }
        ]
        
        Rules:
        - Return ONLY a JSON array, no markdown, no comments.
        - Each "options" must have exactly 4 items.
        - "answer" must be one letter only: a, b, c, or d.
        - "explanation" should be 1–2 professional sentences.
        - Cover different parts of the chapter comprehensively.
        - Vary difficulty levels (easy, medium, hard).
        - Ensure the JSON is parseable directly.
        Now generate 50 questions based on the PDF content:
        `;

        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: mcqPrompt },
                        { inlineData: { mimeType, data: base64File } },
                    ],
                },
            ],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        };

        const response = await retryGeminiApiCall(requestBody);
        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        let mcqsFromModel = [];

        // Try JSON.parse first
        try {
            mcqsFromModel = JSON.parse(rawText);
        } catch (e) {
            // Fallback: try to repair JSON
            try {
                mcqsFromModel = JSON.parse(jsonrepair(rawText));
            } catch (e2) {
                // Fallback: regex extraction
                const pattern =
                    /\{\s*"question"\s*:\s*"([^"]+)",\s*"options"\s*:\s*\[([^\]]+)\],\s*"answer"\s*:\s*"([a-d])",\s*"explanation"\s*:\s*"([^"]+)"\s*\}/gm;
                const matches = [...rawText.matchAll(pattern)];
                for (const m of matches) {
                    const options = m[2]
                        .split(",")
                        .map((s: any) => s.trim().replace(/^"|"$/g, ""));
                    if (options.length === 4) {
                        mcqsFromModel.push({
                            question: m[1],
                            options,
                            answer: m[3],
                            explanation: m[4],
                        });
                    }
                }
            }
        }

        if (!Array.isArray(mcqsFromModel) || mcqsFromModel.length === 0) {
            return next(
                ErrorHandler.createError(
                    `No questions generated by Gemini. Raw response: ${rawText.substring(0, 500)}`,
                    422
                )
            );
        }

        const validMcqs = mcqsFromModel.filter((mcq) => {
            return (
                mcq.question &&
                Array.isArray(mcq.options) &&
                mcq.options.length === 4 &&
                mcq.answer &&
                ["a", "b", "c", "d"].includes(mcq.answer.toLowerCase())
            );
        });

        if (validMcqs.length === 0) {
            return next(
                ErrorHandler.createError(
                    `Gemini returned MCQs, but none were valid. Raw response: ${rawText.substring(0, 500)}`,
                    422
                )
            );
        }

        // Create quiz with all questions for caching
        const quiz = await QuizModel.create({
            chapterId,
            title: chapter.title,
            questions: [],
            createdBy: req.user._id,
            updatedBy: req.user._id,
        });

        const questionsData = validMcqs.map((mcq) => ({
            quizId: quiz._id,
            question: mcq.question,
            options: mcq.options,
            answer: mcq.answer.toLowerCase(),
            explanation: mcq.explanation || "",
            createdBy: req.user._id,
            updatedBy: req.user._id,
        }));

        const questionsDocs = await QuestionModel.insertMany(questionsData);
        quiz.questions = questionsDocs.map((q) => q._id);
        await quiz.save();

        // Return random 15 questions if we have 50+, otherwise return all
        let questionsToReturn = questionsDocs;
        if (questionsDocs.length >= 50) {
            const shuffled = [...questionsDocs].sort(() => 0.5 - Math.random());
            questionsToReturn = shuffled.slice(0, 15);
        }

        const populatedQuiz = await QuizModel.findById(quiz._id)
            .populate({
                path: "questions",
                select: "question options createdAt updatedAt",
            })
            .populate("chapterId", "title")
            .populate("createdBy", "name email");

        if (!populatedQuiz) {
            return next(
                ErrorHandler.createError("Failed to retrieve created quiz", 500)
            );
        }

        res.status(201).json({
            success: true,
            message: "Quiz created successfully",
            quiz: {
                ...populatedQuiz.toObject(),
                questions: questionsToReturn.map((q) => ({
                    _id: q._id,
                    question: q.question,
                    options: q.options,
                    createdAt: q.createdAt,
                    updatedAt: q.updatedAt,
                })),
            },
            totalQuestions: questionsToReturn.length,
            totalCachedQuestions: questionsDocs.length,
            cached: false,
        });
    } catch (error) {
        console.error("Error creating quiz:", error);
        const errMsg = (error as any).message || "Failed to create quiz";
        return next(ErrorHandler.createError(errMsg, 500));
    }
});
const getChapterSummary = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) return next(ErrorHandler.createError("Chapter not found", 404));
    const summary = await SummaryModel.findOne({ chapterId: chapter._id });
    if (!summary) return next(ErrorHandler.createError("Summary not found", 404));
    res.status(200).json({
        success: true,
        message: "Summary retrieved successfully",
        summary: summary,
    });
});

const getchapterquiz = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) return next(ErrorHandler.createError("Chapter not found", 404));
    const quiz = await QuizModel.findOne({ chapterId: chapter._id });
    if (!quiz) return next(ErrorHandler.createError("Quiz not found", 404));
    res.status(200).json({
        success: true,
        message: "Quiz retrieved successfully",
        quiz: quiz,
    });
});

const getQuizQuestions = asyncWrapper(async (req, res, next) => {
    const { quizId } = req.params;
    const quiz = await QuizModel.findById(quizId);
    if (!quiz) return next(ErrorHandler.createError("Quiz not found", 404));
    var questions: any = [];
    for (let i = 0; i < quiz.questions.length; i++) {
        const question = await QuestionModel.findById(quiz.questions[i]);
        if (!question)
            return next(ErrorHandler.createError("Question not found", 404));
        questions.push(question);
    }
    res.status(200).json({
        success: true,
        message: "Questions retrieved successfully",
        questions: questions,
    });
});
const setUserQuizStatus = asyncWrapper(async (req, res, next) => {
    // Expected body:
    // {
    //   quizId: string,
    //   chapterId: string,
    //   answers: [{ questionId: string, answer: string }]
    // }
    const userId = req.user._id;
    const { quizId, chapterId, answers, timeTaken } = req.body || {};
    if (!quizId) return next(ErrorHandler.createError("quizId is required", 400));
    if (!chapterId)
        return next(ErrorHandler.createError("chapterId is required", 400));
    if (!Array.isArray(answers) || answers.length === 0) {
        return next(
            ErrorHandler.createError("answers must be a non-empty array", 400)
        );
    }

    const quiz = await QuizModel.findById(quizId);
    if (!quiz) return next(ErrorHandler.createError("Quiz not found", 404));
    if (quiz.chapterId.toString() !== chapterId.toString()) {
        return next(
            ErrorHandler.createError(
                "quizId does not belong to provided chapterId",
                400
            )
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
        const qId = a.questionId || a.quetionid; // tolerate misspelling from comment
        const selected = (a.answer || "").toString().trim().toLowerCase();
        if (!qId || !selected) continue;
        const qDoc = questionIdToDoc[qId.toString()];
        if (!qDoc) continue; // ignore answers for questions not in this quiz
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
    const passThreshold = 70; // configurable
    const status = scorePercent >= passThreshold ? "Passed" : "Failed";

    // Upsert user quiz status with a new attempt
    const attempt = {
        timeTaken: timeTaken,
        startedAt: new Date(),
        completedAt: new Date(),
        answers: gradedAnswers,
    } as any;

    const userQuizStatus = await UserQuizStatusModel.findOneAndUpdate(
        { userId: userId, quizId: quizId, chapterId: chapterId },
        {
            $set: { status: status, score: scorePercent },
            $push: { attempts: attempt },
        },
        { new: true, upsert: true }
    );

    return res.status(200).json({
        success: true,
        message: "Quiz graded successfully",
        result: {
            totalQuestions,
            correct: correctCount,
            score: scorePercent,
            status,
            gradedAnswers,
        },
        userQuizStatus,
    });
});
const updatefolder = asyncWrapper(async (req, res, next) => {
    const {
        folderId,
        title,
        description,
        status,
        sharedWith,
        icon,
        color,
        category,
    } = req.body;
    const folder = await FolderModel.findById(folderId);
    if (!folder) return next(ErrorHandler.createError("Folder not found", 404));
    console.log(
        folderId,
        title,
        description,
        status,
        sharedWith,
        icon,
        color,
        category
    );
    folder.title = title ?? folder.title;
    folder.description = description ?? folder.description;
    folder.status = status ?? folder.status;
    folder.sharedWith = sharedWith ?? folder.sharedWith;
    folder.icon = icon ?? folder.icon;
    folder.color = color ?? folder.color;
    folder.category = category ?? folder.category;
    await folder.save();
    // SSE: Notify owner and shared users
    try {
        const { sendEventToUser } = require("./sseController");
        // Notify shared users
        if (Array.isArray(folder.sharedWith)) {
            folder.sharedWith.forEach((uid: any) => {
                sendEventToUser(uid.toString(), {
                    type: "folder_shared_updated",
                    folderId: folder._id,
                    folder,
                });
            });
        }
    } catch (err) {
        // Ignore SSE errors
    }
    // Always return sharedWith as array of {_id, username} objects
    let sharedWithUsers: any = [];
    try {
        if (Array.isArray(folder.sharedWith) && folder.sharedWith.length > 0) {
            sharedWithUsers = await UserModel.find({ _id: { $in: folder.sharedWith } })
                .select('_id username profilePicture email')
                .lean();
        }
    } catch (err) {
        // fallback: return empty array if error
        sharedWithUsers = [];
    }
    res.status(200).json({
        success: true,
        message: "Folder updated successfully",
        folder: {
            _id: folder._id,
            title: folder.title,
            description: folder.description,
            status: folder.status,
            sharedWith: sharedWithUsers,
            icon: folder.icon,
            color: folder.color,
            category: folder.category,
            createdAt: folder.createdAt,
            ownerId: folder.ownerId,
            chapterCount: 0,
        },
    });
});
const getfolders = asyncWrapper(async (req, res, next) => {
    const user = req.user;
    // Use aggregation to get folders with chapter counts
    const foldersWithChapterCount = await FolderModel.aggregate([
        // 1️⃣ Match folders owned by the user or shared with them
        {
            $match: {
                $or: [
                    { ownerId: new mongoose.Types.ObjectId(user._id) },
                    {
                        sharedWith: {
                            $elemMatch: { $eq: new mongoose.Types.ObjectId(user._id) },
                        },
                    },
                ],
            },
        },

        // 2️⃣ Lookup chapters to count them
        {
            $lookup: {
                from: "chapters",
                localField: "_id",
                foreignField: "folderId",
                as: "chapters",
            },
        },

        // 3️⃣ Lookup to fetch shared user details
        {
            $lookup: {
                from: "users",
                localField: "sharedWith",
                foreignField: "_id",
                as: "sharedUsers",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            username: 1, // ✅ only these two fields
                            profilePicture: 1,
                            email: 1,
                        },
                    },
                ],
            },
        },

        // 4️⃣ Add a field for chapter count
        {
            $addFields: {
                chapterCount: { $size: "$chapters" },
                sharedWith: "$sharedUsers", // rename for cleaner response
            },
        },

        // 5️⃣ Remove unneeded fields
        {
            $project: {
                chapters: 0,
                sharedUsers: 0, // already renamed to sharedWith
            },
        },
    ]);

    res.status(200).json({
        success: true,
        message: "Folders retrieved successfully with chapter counts",
        folders: foldersWithChapterCount,
    });
});
const quizhistory = asyncWrapper(async (req, res, next) => {
    const userId = req.user._id;
    const { chapterId } = req.body || {};

    if (!chapterId) {
        return next(ErrorHandler.createError("chapterId is required", 400));
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
            const qDoc = a.questionId; // populated doc
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

    return res.status(200).json({
        success: true,
        message: "Quiz history retrieved successfully",
        history: {
            attempts: attemptsWithDegree,
            overallStatus: latestStatusDoc.status,
            overallScore: latestStatusDoc.score,
            totalAttempts,
            bestScore,
            averageScore,
            passRate,
        },
    });
});
const getchapters = asyncWrapper(async (req, res, next) => {
    const user = req.user;
    const { folderId } = req.params;
    // Aggregate chapters with user quiz status for this user and chapter
    const chaptersWithStatus = await ChapterModel.aggregate([
        { $match: { folderId: new mongoose.Types.ObjectId(folderId) } },
        {
            $lookup: {
                from: "userquizstatuses",
                let: { chapterId: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$chapterId", "$$chapterId"] },
                                    { $eq: ["$userId", new mongoose.Types.ObjectId(user._id)] },
                                ],
                            },
                        },
                    },
                    { $sort: { updatedAt: -1 } },
                    { $limit: 1 },
                ],
                as: "userQuizStatus",
            },
        },
        {
            $addFields: {
                userQuizStatusObj: { $arrayElemAt: ["$userQuizStatus", 0] },
            },
        },
        {
            $project: {
                _id: 1,
                title: 1,
                description: 1,
                createdAt: 1,
                createdBy: 1,
                summaryId: 1,
                // Extract just the status from the userQuizStatus object or return "NotTaken" if not found
                quizStatus: { $ifNull: ["$userQuizStatusObj.status", "NotTaken"] },
                quizScore: { $ifNull: ["$userQuizStatusObj.score", 0] },
                quizCompleted: {
                    $cond: [{ $ifNull: ["$userQuizStatusObj", false] }, true, false],
                },
                // We don't include content, contentType, or quizStatuses
            },
        },
    ]);
    res.status(200).json({
        success: true,
        message: "Chapters retrieved successfully",
        chapters: chaptersWithStatus,
    });
});
const getchaptercontent = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) return next(ErrorHandler.createError("Chapter not found", 404));
    res.status(200).json({
        success: true,
        message: "Chapter retrieved successfully",
        content: chapter.content,
        contentType: chapter.contentType,
    });
});
const deletefolder = asyncWrapper(async (req, res, next) => {
    const { folderId } = req.params;
    const user = req.user;
    const folder = await FolderModel.findById(folderId);
    if (folder == null) {
        return next(ErrorHandler.createError("Folder not found", 404, []));
    }
    if (folder.ownerId != user._id) {
        return next(
            ErrorHandler.createError("Folder not have access to delete it ", 404, [])
        );
    }
    await folder.deleteOne();
    // SSE: Notify owner and shared users
    try {
        const { sendEventToUser } = require("./sseController");
        sendEventToUser(folder.ownerId.toString(), {
            type: "folder_deleted",
            folderId: folder._id,
        });
        // Notify shared users
        if (Array.isArray(folder.sharedWith)) {
            folder.sharedWith.forEach((uid: any) => {
                sendEventToUser(uid.toString(), {
                    type: "folder_shared_deleted",
                    folderId: folder._id,
                });
            });
        }
    } catch (err) {
        // Ignore SSE errors
    }
    return res.status(200).json({
        success: true,
        message: "Folder deleted  successfully",
    });
});
const deletechapter = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const userId = req.user._id;
    const chapter = await ChapterModel.findById(chapterId);
    if (chapter == null) {
        return next(ErrorHandler.createError("chapter not found", 404, []));
    }
    const folderId = chapter.folderId;
    const folder = await FolderModel.findById(folderId);
    if (folder!.ownerId != userId) {
        return next(
            ErrorHandler.createError(
                "you not have access to delete it chapter Must be the owner of file ",
                404,
                []
            )
        );
    }
    await chapter?.deleteOne();
    return res.status(200).json({
        success: true,
        message: "chapter deleted  successfully",
    });
});

export const getAvailableUsersForShare = asyncWrapper(async (req, res) => {
    const { query } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    // Validate folderId format
    const filter: any = { _id: { $nin: [req.user._id], $exists: true } };

    // Build cache key based on query, page, limit
    const cacheKey = `users:${query || "all"}:p${page}:l${limit}`;
    const cached = userSearchCache.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }

    let users: any[] = [];
    let totalResults = 0;

    if (query && query.trim()) {
        const allUsers = await UserModel.find(filter)
            .select("username email _id profilePicture")
            .lean();

        const fuse = new Fuse(allUsers, {
            keys: ["username", "email"],
            threshold: 0.3,
        });

        const searchResults = fuse.search(query.trim());
        const matchedUsers = searchResults.map((r: any) => r.item);

        totalResults = matchedUsers.length;
        users = matchedUsers.slice((page - 1) * limit, page * limit);
    } else {
        [totalResults, users] = await Promise.all([
            UserModel.countDocuments(filter),
            UserModel.find(filter)
                .select("username email _id profilePicture")
                .sort({ username: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
        ]);
    }
    console.log(users);
    const response = {
        page,
        limit,
        totalResults,
        totalPages: Math.ceil(totalResults / limit),
        results: users,
    };

    userSearchCache.set(cacheKey, response);
    res.json(response);
});
const setuserssharewith = asyncWrapper(async (req, res, next) => {
    const { folderId, sharedWith } = req.body;
    const folder = await FolderModel.findById(folderId);
    if (!folder) return next(ErrorHandler.createError("Folder not found", 404));
    folder.sharedWith = sharedWith;
    await folder.save();
    res.status(200).json({
        success: true,
        message: "Users shared successfully",
    });
});
const PdfController = {
    deletefolder,
    createfolder,
    updatefolder,
    createchapter,
    summarizecchapter,
    createquiz,
    getChapterSummary,
    getchapterquiz,
    getQuizQuestions,
    setUserQuizStatus,
    quizhistory,
    getchapters,
    getfolders,
    getchaptercontent,
    deletechapter,
    getAvailableUsersForShare,
    setuserssharewith,
};

export default PdfController;
