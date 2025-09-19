import mongoose from "mongoose";
import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import QuestionModel from "../models/QuestionModel";
import QuizModel from "../models/QuizModel";
import SummaryModel from "../models/SummaryModel";
import UserQuizStatusModel from "../models/UserQuizStatusModel";
import ErrorHandler from "../utils/error";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { jsonrepair } = require("jsonrepair");
const createfolder = asyncWrapper(async (req, res, next) => {
    const { title, description, status, category,
        color, icon, sharedWith
    } = req.body;
    const folder = await FolderModel.create({
        title: title,
        category: category,
        description: description,
        ownerId: req.user._id,
        status: status,
        icon: icon,
        color: color,
        sharedWith: sharedWith
    });
    res.status(200).json({
        success: true,
        message: "Folder created successfully",
        folder: folder,
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
    if (!chapter.content || !Buffer.isBuffer(chapter.content)) {
        return next(ErrorHandler.createError("Chapter content is missing or invalid", 400));
    }
    // Prepare Gemini API request
    const { retryGeminiApiCall, getMimeType } = require('../utils/geminiApi');
    const base64File = chapter.content.toString('base64');
    const mimeType = getMimeType('chapter.pdf', chapter.contentType);
    const requestBody = {
        contents: [{
            parts: [
                { text: `Summarize the following PDF in a professional, structured JSON format suitable for displaying in an educational app. Return ONLY valid JSON with these sections:\n\n1. "key_concepts": a list of main concepts, each with:\n   - "title": the concept title\n   - "text": a clear, professional explanation\n   - "tags": optional keywords\n   - "difficulty_level": optional ("easy", "medium", "hard")\n\n2. "examples": a list of practical examples for each concept, each with:\n   - "concept": the concept it illustrates\n   - "example": step-by-step calculation or explanation\n   - "notes": optional short note\n\n3. "professional_implications": list of professional applications, each with:\n   - "title": area of application\n   - "text": explanation of importance in practice\n\nEnsure:\n- Clear, concise sentences\n- Include numerical/formula examples where relevant\n- JSON is valid and parseable for direct use in an app.` },
                { inlineData: { mimeType, data: base64File } }
            ]
        }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    };
    const response = await retryGeminiApiCall(requestBody);
    const data = await response.json();
    let summaryJson;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    try {
        summaryJson = JSON.parse(rawText);
    } catch (e) {
        try {
            summaryJson = JSON.parse(jsonrepair(rawText));
        } catch (e2) {
            summaryJson = {};
        }
    }
    // Ensure the summary matches the required structure
    const mappedSummary = {
        key_concepts: Array.isArray(summaryJson?.key_concepts) ? summaryJson.key_concepts : [],
        examples: Array.isArray(summaryJson?.examples) ? summaryJson.examples : [],
        professional_implications: Array.isArray(summaryJson?.professional_implications) ? summaryJson.professional_implications : [],
    };
    // If Gemini output contains the required keys, return it directly
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
        message: "Gemini did not generate a valid summary. See raw response for troubleshooting.",
        rawGeminiResponse: rawJson
    });

});

const createquiz = asyncWrapper(async (req, res, next) => {
    console.log('=== CREATE QUIZ START ===');
    console.log('Request body:', req.body);
    console.log('User ID:', req.user?._id);

    const { chapterId, title, description } = req.body;
    try {
        if (!chapterId) return next(ErrorHandler.createError("chapterId is required", 400));
        if (!title) return next(ErrorHandler.createError("title is required", 400));
        const chapter = await ChapterModel.findById(chapterId);
        if (!chapter) return next(ErrorHandler.createError("Chapter not found", 404));
        if (!chapter.content || !Buffer.isBuffer(chapter.content)) return next(ErrorHandler.createError("Chapter content is required", 400));
        const { retryGeminiApiCall, getMimeType } = require('../utils/geminiApi');
        const base64File = chapter.content.toString('base64');
        const mimeType = getMimeType('chapter.pdf', chapter.contentType);
        const mcqPrompt = `Generate 10 multiple choice questions from this PDF. Return the result as a valid JSON array where each question follows this format:\n[\n  {\n    "question": "What is...",\n    "options": ["a) Option 1", "b) Option 2", "c) Option 3", "d) Option 4"],\n    "answer": "a",\n    "explanation": "This is correct because..."\n  }\n]\nMake sure:\n1. Questions are clear and specific\n2. All 4 options are plausible\n3. Only one correct answer\n4. Answer is just the letter (a, b, c, or d)\n5. Explanation is 1-2 sentences\n6. Return valid JSON only.`;
        const requestBody = {
            contents: [{
                parts: [
                    { text: mcqPrompt },
                    { inlineData: { mimeType, data: base64File } }
                ]
            }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        };
        const response = await retryGeminiApiCall(requestBody);
        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('Gemini raw MCQ response:', rawText);
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
                const pattern = /\{\s*"question"\s*:\s*"([^"]+)",\s*"options"\s*:\s*\[([^\]]+)\],\s*"answer"\s*:\s*"([a-d])",\s*"explanation"\s*:\s*"([^"]+)"\s*\}/gm;
                const matches = [...rawText.matchAll(pattern)];
                for (const m of matches) {
                    interface MCQMatch {
                        question: string;
                        options: string[];
                        answer: string;
                        explanation: string;
                    }

                    const options: string[] = m[2].split(',').map((s: string) => s.trim().replace(/^"|"$/g, ''));
                    if (options.length === 4) {
                        mcqsFromModel.push({ question: m[1], options, answer: m[3], explanation: m[4] });
                    }
                }
            }
        }
        if (!Array.isArray(mcqsFromModel) || mcqsFromModel.length === 0) {
            return next(ErrorHandler.createError(
                `No questions generated by Gemini. Raw response: ${rawText.substring(0, 500)}`,
                422
            ));
        }
        const validMcqs = mcqsFromModel.filter((mcq) => {
            return mcq.question && Array.isArray(mcq.options) && mcq.options.length === 4 && mcq.answer && ['a', 'b', 'c', 'd'].includes(mcq.answer.toLowerCase());
        });
        if (validMcqs.length === 0) {
            return next(ErrorHandler.createError(
                `Gemini returned MCQs, but none were valid. Raw response: ${rawText.substring(0, 500)}`,
                422
            ));
        }
        const quiz = await QuizModel.create({
            chapterId,
            title,
            description: description || "",
            questions: [],
            createdBy: req.user._id,
            updatedBy: req.user._id,
        });
        const questionsData = validMcqs.map(mcq => ({
            quizId: quiz._id,
            question: mcq.question,
            options: mcq.options,
            answer: mcq.answer.toLowerCase(),
            explanation: mcq.explanation || "",
            createdBy: req.user._id,
            updatedBy: req.user._id,
        }));
        const questionsDocs = await QuestionModel.insertMany(questionsData);
        quiz.questions = questionsDocs.map(q => q._id);
        await quiz.save();
        const populatedQuiz = await QuizModel.findById(quiz._id)
            .populate('questions')
            .populate('chapterId', 'title')
            .populate('createdBy', 'name email');
        res.status(201).json({
            success: true,
            message: "Quiz created successfully",
            quiz: populatedQuiz,
            totalQuestions: questionsDocs.length,
        });
    } catch (error) {
        console.error('Error creating quiz:', error);
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
        if (!question) return next(ErrorHandler.createError("Question not found", 404));
        questions.push(question);
    }
    res.status(200).json({
        success: true,
        message: "Questions retrieved successfully",
        questions: questions,
    });
});
const setUserQuizStatus = asyncWrapper(async (req, res, next) => {
    const { quizId, chapterId, attempt } = req.body;
    const user = req.user;
    const prv = await UserQuizStatusModel.findOne({ userId: user._id, quizId: quizId });
    //add the new one into attempts
    if (prv) {
        let score = 0;
        for (let i = 0; i < attempt.answers.length; i++) {
            if (attempt.answers[i].isCorrect) {
                score++;
            }
        }
        prv.attempts.push({
            startedAt: attempt.startedAt || Date.now(),
            completedAt: attempt.completedAt || Date.now(),
            answers: attempt.answers || []
        });
        prv.score = score;
        prv.status = ((score / attempt.answers.length) * 100) >= 50 ? "Passed" : "Failed";
        await prv.save();
    }
    else {
        let score = 0;
        for (let i = 0; i < attempt.answers.length; i++) {
            if (attempt.answers[i].isCorrect) {
                score++;
            }
        }
        const userQuizStatus = await UserQuizStatusModel.create({
            userId: user._id,
            status: ((score / attempt.answers.length) * 100) >= 50 ? "Passed" : "Failed",
            quizId,
            score,
            chapterId,
            attempts: [{
                startedAt: attempt.startedAt || Date.now(),
                completedAt: attempt.completedAt || Date.now(),
                answers: attempt.answers || []
            }],
        });
    }
    res.status(200).json({
        success: true,
        message: "User quiz status set successfully"
    });
});
const updatefolder = asyncWrapper(async (req, res, next) => {
    const { folderId, title, description, status, sharedWith, icon, color, category } = req.body;
    const folder = await FolderModel.findById(folderId);
    if (!folder) return next(ErrorHandler.createError("Folder not found", 404));
    console.log(folderId, title, description, status, sharedWith, icon, color, category);
    folder.title = title ?? folder.title;
    folder.description = description ?? folder.description;
    folder.status = status ?? folder.status;
    folder.sharedWith = sharedWith ?? folder.sharedWith;
    folder.icon = icon ?? folder.icon;
    folder.color = color ?? folder.color;
    folder.category = category ?? folder.category;
    await folder.save();
    res.status(200).json({
        success: true,
        message: "Folder updated successfully",
        folder: folder,
    });
});
const getfolders = asyncWrapper(async (req, res, next) => {
    const user = req.user;
    console.log(user._id);
    // Use aggregation to get folders with chapter counts
    const foldersWithChapterCount = await FolderModel.aggregate([
        // Match folders owned by the user
        { $match: { ownerId: new mongoose.Types.ObjectId(user._id) } },
        // Lookup to join with chapters
        {
            $lookup: {
                from: 'chapters', // The collection name in MongoDB (usually lowercase and plural)
                localField: '_id',
                foreignField: 'folderId',
                as: 'chapters'
            }
        },
        // Add a field for the chapter count
        {
            $addFields: {
                chapterCount: { $size: '$chapters' }
            }
        },
        // Remove the chapters array as we only needed the count
        {
            $project: {
                chapters: 0
            }
        }
    ]);

    res.status(200).json({
        success: true,
        message: "Folders retrieved successfully with chapter counts",
        folders: foldersWithChapterCount,
    });
})
const getchapters = asyncWrapper(async (req, res, next) => {
    const user = req.user;
    const { folderId } = req.params;
    // Aggregate chapters with user quiz status for this user and chapter
    const chaptersWithStatus = await ChapterModel.aggregate([
        { $match: { folderId: new mongoose.Types.ObjectId(folderId) } },
        {
            $lookup: {
                from: 'userquizstatuses', // MongoDB collection name
                localField: '_id',
                foreignField: 'chapterId',
                as: 'quizStatuses'
            }
        },
        {
            $addFields: {
                // Filter quiz statuses to only those belonging to current user
                userQuizStatus: {
                    $filter: {
                        input: '$quizStatuses',
                        as: 'status',
                        cond: { $eq: ['$$status.userId', new mongoose.Types.ObjectId(user._id)] }
                    }
                }
            }
        },
        {
            $addFields: {
                // Get the first matching status (should be only one per chapter)
                userQuizStatusObj: { $arrayElemAt: ['$userQuizStatus', 0] }
            }
        },
        {
            $project: {
                _id: 1,
                title: 1,
                description: 1,
                createdAt: 1,
                createdBy: 1,
                summaryId: 1,
                // Extract just the status from the userQuizStatus object or return "Not Taken" if not found
                quizStatus: { $ifNull: ['$userQuizStatusObj.status', 'Not Taken'] },
                quizScore: { $ifNull: ['$userQuizStatusObj.score', 0] },
                quizCompleted: { $cond: [{ $ifNull: ['$userQuizStatusObj', false] }, true, false] }
                // We don't include content, contentType, or quizStatuses
            }
        }
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
        return next(ErrorHandler.createError("Folder not have access to delete it ", 404, []));
    }
    await folder.deleteOne();
    return res.status(200).json({
        success: true,
        message: "Folder deleted  successfully",
    });
})
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
    getchapters,
    getfolders,
    getchaptercontent
};

export default PdfController;