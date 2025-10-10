import Fuse from "fuse.js";
import mongoose from "mongoose";
import NodeCache from "node-cache";
import {delCache, getCache,setCache} from "../../api/redisClient";
import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import QuestionModel from "../models/QuestionModel";
import QuizModel from "../models/QuizModel";
import SummaryModel from "../models/SummaryModel";
import UserModel from "../models/UserModel";
import UserQuizStatusModel from "../models/UserQuizStatusModel";
import { CacheKeys } from "../utils/cache_keys";
import ErrorHandler from "../utils/error";
import { getMimeType, retryGeminiApiCall } from "../utils/geminiApi";
const userSearchCache = new NodeCache({ stdTTL: 300 }); // 5 min TTL
import CacheHelper from "../utils/cacheHelper";

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
            sharedWithUsers = await UserModel.find({
                _id: { $in: folder.sharedWith },
            })
                .select("_id username email profilePicture")
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
    const affectedUserIds = [
        req.user._id.toString(),
        ...(sharedWith || []).map((id: any) => id.toString()),
    ];
    
    await Promise.all(
        affectedUserIds.map(userId => CacheHelper.invalidateUserFolders(userId))
    );
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
    const folder = await FolderModel.findById(folderId);
    if (!folder) {
        return next(ErrorHandler.createError("Folder not found", 404));
    }
    if (!file) {
        return next(ErrorHandler.createError("PDF file is required", 400));
    }
    if (file.mimetype !== "application/pdf") {
        return next(ErrorHandler.createError("PDF file is required", 400));
    }
    // make overcontent to get the content for pdf
    const { retryGeminiApiCall, getMimeType } = require("../utils/geminiApi");
    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: `
You are an expert document cleaning and text extraction assistant. Your task is to process the provided PDF and return a clean, structured, and complete text version of its content.

**Instructions:**
1. **Extract all text.** Capture all readable text from the document, including headings, paragraphs, and lists.
2. **Remove noise and artifacts.** Eliminate OCR errors, visual artifacts, duplicated phrases, page numbers, headers, and footers.
3. **Structure and normalize content.**
    * Reconstruct broken sentences and paragraphs.
    * Maintain the original hierarchy of chapters, sections, and sub-sections.
    * Preserve bullet points, numbered lists, and code blocks.
4. **Final output:** Provide ONLY the cleaned, raw text content of the document. Do not summarize, interpret, or add any commentary. The final output must be ready for further AI analysis, such as quiz generation.

**Output format:** Return the full, uninterpreted text in a single, well-formatted string.
`,
                    },
                    {
                        inlineData: {
                            mimeType: getMimeType(file.originalname),
                            data: file.buffer.toString("base64"), // send PDF to Gemini
                        },
                    },
                ],
            },
        ],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    };

    const response = await retryGeminiApiCall(requestBody);
    const data = await response.json();

    const chapter = await ChapterModel.create({
        content: file.buffer,
        contentType: file.mimetype,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        folderId: folderId,
        overcontent: data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null,
        title: title,
        description: description,
        category: category,
    });
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const overcontentKey = CacheKeys.getChapterOverContentKey(chapter._id.toString());
        await CacheHelper.set(
            overcontentKey,
            data.candidates[0].content.parts[0].text,
            CacheKeys.TTL.ONE_WEEK
        );
    }

    // ✅ Invalidate chapters list for all affected users
    const affectedUsers = [
        folder.ownerId.toString(),
        ...(folder.sharedWith || []).map((id: any) => id.toString()),
    ];
    
    await CacheHelper.invalidateChaptersList(folderId, affectedUsers);
    res.status(200).json({
        success: true,
        message: "Chapter created successfully",
    });
});
const summarizecchapter = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.body;
    const user = req.user as any;

    if (!chapterId) {
        return next(ErrorHandler.createError("chapterId is required", 400));
    }

    const summaryKey = CacheKeys.getSummaryKey(chapterId);

    // ✅ Try cache first
    const cachedSummary = await CacheHelper.get(summaryKey);
    if (cachedSummary) {
        return res.status(200).json({
            success: true,
            message: "Retrieved summary from cache",
            summary: cachedSummary,
            cached: true,
        });
    }

    // ✅ Try MongoDB
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) {
        return next(ErrorHandler.createError("Chapter not found", 404));
    }

    if (chapter.summaryId) {
        const summaryModel = await SummaryModel.findById(chapter.summaryId);
        if (summaryModel) {
            // Repopulate cache
            await CacheHelper.set(
                summaryKey,
                summaryModel.summary,
                CacheKeys.TTL.ONE_WEEK
            );
            
            return res.status(200).json({
                success: true,
                message: "Retrieved summary from database",
                summary: summaryModel.summary,
                cached: false,
            });
        }
    }

    // ✅ Generate new summary
    const chapterContent = chapter.overcontent || chapter.content?.toString("utf-8") || "";
    
    if (!chapterContent) {
        return next(ErrorHandler.createError("Chapter content missing", 400));
    }

    const base64File = chapter.content?.toString("base64") || "";
    const mimeType = getMimeType("chapter.pdf", chapter.contentType);
    
    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: `You are a highly detailed academic assistant that **converts educational content into structured JSON**.
                    
                        Task:
                        - Carefully analyze the provided content.
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
                        
                        Now process the following content:
                        ${chapter.overcontent || ""}`,
                    },
                    ...(chapter.overcontent ? [] : [
                        { inlineData: { mimeType, data: base64File } }
                    ]),
                ],
            },
        ],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    };

    const response = await retryGeminiApiCall(requestBody);
    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    let summaryJson;
    try {
        summaryJson = JSON.parse(rawText);
    } catch {
        try {
            const { jsonrepair } = require("jsonrepair");
            summaryJson = JSON.parse(jsonrepair(rawText));
        } catch (err) {
            return next(ErrorHandler.createError("Invalid Gemini JSON response", 400));
        }
    }

    // Save in MongoDB
    const summaryModel = await SummaryModel.create({
        chapterId,
        summary: summaryJson,
        createdBy: user._id,
        updatedBy: user._id,
    });

    chapter.summaryId = summaryModel._id;
    await chapter.save();

    // ✅ Cache the result
    await CacheHelper.set(summaryKey, summaryJson, CacheKeys.TTL.ONE_WEEK);

    return res.status(200).json({
        success: true,
        message: "Chapter summarized successfully",
        summary: summaryJson,
        summaryModel,
        cached: false,
    });
});const createquiz = asyncWrapper(async (req, res, next) => {
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
You are an AI assistant that creates multiple choice quizzes.
Generate exactly ${needed} new questions from the provided content.
Do NOT repeat any of the questions listed below.

Existing questions:
${existingTexts}

Format (JSON only):
[
  {
    "question": "Your question text?",
    "options": ["a) Option1", "b) Option2", "c) Option3", "d) Option4"],
    "answer": "a",
    "explanation": "1–2 sentence explanation."
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
// --- Helper functions ---
function mergeUniqueByQuestion(arr1: any[], arr2: any[]) {
    const map = new Map();
    [...arr1, ...arr2].forEach((q) => {
        if (!map.has(q.question)) map.set(q.question, q);
    });
    return Array.from(map.values());
}

function shuffle(array: any[]) {
    return array.sort(() => 0.5 - Math.random());
}

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
            totalQuestions: 15,
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
  
    // Always return sharedWith as array of {_id, username, email, profilePicture}
    const oldSharedWith = folder.sharedWith || [];
    const newSharedWith = sharedWith || [];
    let sharedWithUsers: any = [];
    try {
        if (Array.isArray(folder.sharedWith) && folder.sharedWith.length > 0) {
            sharedWithUsers = await UserModel.find({
                _id: { $in: folder.sharedWith },
            })
                .select("_id username profilePicture email")
                .lean();
        }
    } catch (err) {
        // fallback: return empty array if error
        sharedWithUsers = [];
    }
    // SSE: Notify owner and shared users
    try {
        const { sendEventToUser } = require("./sseController");
        // Notify owner
        sendEventToUser(folder.ownerId.toString(), {
            type: "folder_updated",
            folder: {
                ...folder.toObject(),
                sharedWith: sharedWithUsers,
            },
        });
        // Notify shared users
        if (Array.isArray(folder.sharedWith)) {
            folder.sharedWith.forEach((uid: any) => {
                sendEventToUser(uid.toString(), {
                    type: "folder_shared_updated",
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
    const allAffectedUsers = new Set([
        folder.ownerId.toString(),
        ...oldSharedWith.map((id: any) => id.toString()),
        ...newSharedWith.map((id: any) => id.toString()),
    ]);

    await Promise.all(
        Array.from(allAffectedUsers).map(userId => 
            CacheHelper.invalidateUserFolders(userId)
        )
    );
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
    const userId = user._id.toString();

    // ✅ Use cache helper with getOrSet pattern
    const { data: folders, cached } = await CacheHelper.getOrSet(
        CacheKeys.getFoldersListKey(userId),
        async () => {
            // Aggregate folders with chapter counts
            const foldersWithChapterCount = await FolderModel.aggregate([
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
                {
                    $lookup: {
                        from: "chapters",
                        localField: "_id",
                        foreignField: "folderId",
                        as: "chapters",
                    },
                },
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
                                    username: 1,
                                    profilePicture: 1,
                                    email: 1,
                                },
                            },
                        ],
                    },
                },
                {
                    $addFields: {
                        chapterCount: { $size: "$chapters" },
                        sharedWith: "$sharedUsers",
                    },
                },
                {
                    $project: {
                        chapters: 0,
                        sharedUsers: 0,
                    },
                },
            ]);

            return foldersWithChapterCount;
        },
        CacheKeys.TTL.SIX_HOURS
    );

    res.status(200).json({
        success: true,
        message: "Folders retrieved successfully",
        folders,
        cached,
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
    const userId = user._id;
    const { folderId } = req.params;
    if(!folderId){
        return next(ErrorHandler.createError("folderId is required", 400));
    }
    const { data: chapters, cached } = await CacheHelper.getOrSet(
        CacheKeys.getChaptersListKey(folderId, userId),
        async () => {
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
                                            { $eq: ["$userId", new mongoose.Types.ObjectId(userId)] },
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
                        quizStatus: { $ifNull: ["$userQuizStatusObj.status", "NotTaken"] },
                        quizScore: { $ifNull: ["$userQuizStatusObj.score", 0] },
                        quizCompleted: {
                            $cond: [{ $ifNull: ["$userQuizStatusObj", false] }, true, false],
                        },
                    },
                },
            ]);

            return chaptersWithStatus;
        },
        CacheKeys.TTL.SIX_HOURS
    );

    res.status(200).json({
        success: true,
        message: "Chapters retrieved successfully",
        chapters,
        cached,
    });
});
const getchaptercontent = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) return next(ErrorHandler.createError("Chapter not found", 404));
    const cachedContent = await CacheHelper.getCachedChapterContent(chapterId);
    
    if (cachedContent) {
        return res.status(200).json({
            success: true,
            message: "Chapter content retrieved from cache",
            content: cachedContent,
            contentType: chapter.contentType,
            cached: true,
        });
    }

    // Cache the content
    await CacheHelper.cacheChapterContent(
        chapterId,
        chapter.content,
        CacheKeys.TTL.ONE_WEEK
    );

    res.status(200).json({
        success: true,
        message: "Chapter content retrieved successfully",
        content: chapter.content,
        contentType: chapter.contentType,
        cached: false,
    });
});
const deletefolder = asyncWrapper(async (req, res, next) => {
    const { folderId } = req.params;
    const user = req.user;

    const folder = await FolderModel.findById(folderId);
    if (!folder) {
        return next(ErrorHandler.createError("Folder not found", 404));
    }

    if (folder.ownerId.toString() !== user._id.toString()) {
        return next(ErrorHandler.createError("Access denied", 403));
    }

    // Get shared users before deletion
    let sharedWithUsers: any = [];
    if (Array.isArray(folder.sharedWith) && folder.sharedWith.length > 0) {
        sharedWithUsers = await UserModel.find({
            _id: { $in: folder.sharedWith },
        })
            .select("_id username email profilePicture")
            .lean();
    }

    // ✅ Invalidate all folder-related caches
    await CacheHelper.invalidateFolder(folder);

    await folder.deleteOne();

    // SSE notifications
    try {
        const { sendEventToUser } = require("./sseController");
        
        sendEventToUser(folder.ownerId.toString(), {
            type: "folder_deleted",
            folder: { ...folder.toObject(), sharedWith: sharedWithUsers },
        });

        if (Array.isArray(folder.sharedWith)) {
            folder.sharedWith.forEach((uid: any) => {
                sendEventToUser(uid.toString(), {
                    type: "folder_shared_deleted",
                    folder: { ...folder.toObject(), sharedWith: sharedWithUsers },
                });
            });
        }
    } catch (err) {
        console.error("[SSE] Error sending folder_deleted event:", err);
    }

    return res.status(200).json({
        success: true,
        message: "Folder deleted successfully",
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
    if(!folder){
        
            return next(ErrorHandler.createError("Folder not found", 404));

    }
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
    const affectedUsers = [
        folder.ownerId.toString(),
        ...(folder.sharedWith || []).map((id: any) => id.toString()),
    ];

    // ✅ Invalidate all chapter-related caches
    await CacheHelper.invalidateChapter(chapterId, folder.id, affectedUsers);

    await chapter.deleteOne();
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
