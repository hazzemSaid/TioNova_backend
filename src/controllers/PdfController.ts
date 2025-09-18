import axios from "axios";
import FormData from "form-data";
import fs from 'fs';
import mongoose from "mongoose";
import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import QuestionModel from "../models/QuestionModel";
import QuizModel from "../models/QuizModel";
import SummaryModel from "../models/SummaryModel";
import UserQuizStatusModel from "../models/UserQuizStatusModel";
import ErrorHandler from "../utils/error";
import { extractTextFromPdfBuffer, splitIntoChunks } from "../utils/pdfExtract";
import { openrouterChat } from "../utils/openrouter";
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
    try {
        const { chapterId } = req.body;

        // Input validation
        if (!chapterId) {
            return next(ErrorHandler.createError("chapterId is required", 400));
        }

        // Check if chapter exists and has content
        const chapter = await ChapterModel.findById(chapterId);
        if (!chapter) {
            return next(ErrorHandler.createError("Chapter not found", 404));
        }
        if (!chapter.content || !Buffer.isBuffer(chapter.content)) {
            return next(ErrorHandler.createError("Chapter content is missing or invalid", 400));
        }

        // Extract text from PDF (with OCR fallback)
        const extractedText = await extractTextFromPdfBuffer(chapter.content as Buffer, { maxPages: 10 });
        if (!extractedText || extractedText.trim().length < 50) {
            return next(ErrorHandler.createError("Unable to extract sufficient text from PDF", 400));
        }

        // Build prompt similar to python service
        const prompt = `Summarize the following text in a professional, structured JSON format suitable for displaying in an educational app. \nReturn ONLY valid JSON with these sections:\n\n1. "key_concepts": a list of main concepts, each with:\n   - "title": the concept title\n   - "text": a clear, professional explanation\n   - "tags": optional keywords\n   - "difficulty_level": optional ("easy", "medium", "hard")\n\n2. "examples": a list of practical examples for each concept, each with:\n   - "concept": the concept it illustrates\n   - "example": step-by-step calculation or explanation\n   - "notes": optional short note\n\n3. "professional_implications": list of professional applications, each with:\n   - "title": area of application\n   - "text": explanation of importance in practice\n\nEnsure:\n- Clear, concise sentences\n- Include numerical/formula examples where relevant\n- JSON is valid and parseable for direct use in an app\n\nText to summarize:\n${extractedText}`;

        const content = await openrouterChat([
            { role: "system", content: "You are a helpful AI assistant that provides detailed, structured responses." },
            { role: "user", content: prompt },
        ], { temperature: 0.7, maxTokens: 2000 });

        let summaryJson: any = content;
        try {
            const repaired = jsonrepair(content.trim().replace(/^```(json)?/i, '').replace(/```$/,''));
            summaryJson = JSON.parse(repaired);
        } catch {
            // keep raw content if JSON parse fails, to mirror python behavior
        }

        // Save the summary
        const summaryModel = await SummaryModel.create({
            chapterId: chapterId,
            summary: summaryJson,
            createdBy: req.user._id,
            updatedBy: req.user._id,
        });

        // Update chapter with summary reference
        chapter.summaryId = summaryModel._id;
        await chapter.save();

        res.status(200).json({
            success: true,
            message: "Chapter summarized successfully",
            summary: summaryModel,
        });

    } catch (error: any) {
        console.error('Error in summarizecchapter:', error);

        // Handle specific error types
        return next(ErrorHandler.createError(
            error.message || "An unexpected error occurred while processing the PDF",
            500
        ));
    }
});

const createquiz = asyncWrapper(async (req, res, next) => {
    console.log('=== CREATE QUIZ START ===');
    console.log('Request body:', req.body);
    console.log('User ID:', req.user?._id);

    const { chapterId, title, description } = req.body;

    try {
        // Validation
        if (!chapterId) return next(ErrorHandler.createError("chapterId is required", 400));
        if (!title) return next(ErrorHandler.createError("title is required", 400));

        // Find chapter
        console.log('🔍 Finding chapter with ID:', chapterId);
        const chapter = await ChapterModel.findById(chapterId);
        if (!chapter) return next(ErrorHandler.createError("Chapter not found", 404));

        console.log('✅ Chapter found:', {
            id: chapter._id,
            hasContent: !!chapter.content,
            contentType: typeof chapter.content,
            contentSize: Buffer.isBuffer(chapter.content) ? chapter.content.length : 'Not a buffer'
        });

        const chapterContent = chapter.content;
        if (!chapterContent) return next(ErrorHandler.createError("Chapter content is required", 400));

        // 1️⃣ Extract text from PDF
        let fileBuffer: Buffer;
        if (typeof chapterContent === 'string') {
            if (fs.existsSync(chapterContent)) {
                fileBuffer = fs.readFileSync(chapterContent);
            } else {
                return next(ErrorHandler.createError("Chapter file not found", 404));
            }
        } else if (Buffer.isBuffer(chapterContent)) {
            fileBuffer = chapterContent;
        } else {
            return next(ErrorHandler.createError("Invalid chapter content format", 400));
        }

        const text = await extractTextFromPdfBuffer(fileBuffer, { maxPages: 10 });
        if (!text || text.trim().length < 50) {
            return next(ErrorHandler.createError("Unable to extract sufficient text for MCQ generation", 400));
        }

        const chunks = splitIntoChunks(text, 800);
        let selectedText = chunks[0] || text;
        if (selectedText.length > 2000) selectedText = selectedText.slice(0, 2000);

        // 2️⃣ Ask OpenRouter to create MCQs
        const mcqPrompt = `Generate 10 multiple choice questions from this text. \nReturn the result as a valid JSON array where each question follows this exact format:\n\n[\n  {\n    "question": "What is...",\n    "options": ["a) Option 1", "b) Option 2", "c) Option 3", "d) Option 4"],\n    "answer": "a",\n    "explanation": "This is correct because..."\n  }\n]\n\nText to generate questions from:\n${selectedText}\n\nMake sure:\n1. Questions are clear and specific\n2. All 4 options are plausible\n3. Only one correct answer\n4. Answer is just the letter (a, b, c, or d)\n5. Explanation is 1-2 sentences\n6. Return valid JSON only`;

        const mcqContent = await openrouterChat([
            { role: "system", content: "You are a helpful AI assistant that creates high-quality multiple-choice questions." },
            { role: "user", content: mcqPrompt },
        ], { temperature: 0.7, maxTokens: 2000 });

        let mcqsFromModel: any[] = [];
        try {
            const repaired = jsonrepair(mcqContent.trim().replace(/^```(json)?/i, '').replace(/```$/,''));
            const parsed = JSON.parse(repaired);
            if (Array.isArray(parsed)) mcqsFromModel = parsed;
        } catch (e) {
            // fallback: try regex extraction (no dotAll flag; use [\s\S])
            const pattern = /\{\s*"question"\s*:\s*"([^"]+)",\s*"options"\s*:\s*\[([\s\S]*?)\],\s*"answer"\s*:\s*"([a-d])",\s*"explanation"\s*:\s*"([^"]+)"\s*\}/gm;
            const matches = [...mcqContent.matchAll(pattern)];
            for (const m of matches) {
                const options = m[2].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
                if (options.length === 4) {
                    mcqsFromModel.push({ question: m[1], options, answer: m[3], explanation: m[4] });
                }
            }
        }

        if (!Array.isArray(mcqsFromModel) || mcqsFromModel.length === 0) {
            return next(ErrorHandler.createError("No questions generated", 422));
        }

        // Validate MCQ structure
        const validMcqs = mcqsFromModel.filter((mcq, index) => {
            const isValid = mcq.question &&
                Array.isArray(mcq.options) &&
                mcq.options.length === 4 &&
                mcq.answer &&
                ['a', 'b', 'c', 'd'].includes(mcq.answer.toLowerCase());

            if (!isValid) {
                console.log(`❌ Invalid MCQ at index ${index}:`, mcq);
            }
            return isValid;
        });

        console.log('✅ Valid MCQs:', validMcqs.length);

        if (validMcqs.length === 0) {
            return next(ErrorHandler.createError("No valid questions were generated", 422));
        }

        // 2️⃣ Create Quiz without questions
        console.log('📝 Creating quiz...');
        const quiz = await QuizModel.create({
            chapterId,
            title,
            description: description || "",
            questions: [],
            createdBy: req.user._id,
            updatedBy: req.user._id,
        });

        console.log('✅ Quiz created with ID:', quiz._id);

        // 3️⃣ Create all questions at once
        console.log('❓ Creating questions...');
        const questionsData = validMcqs.map(mcq => ({
            quizId: quiz._id,
            question: mcq.question,
            options: mcq.options,
            answer: mcq.answer.toLowerCase(), // Normalize answer to lowercase
            explanation: mcq.explanation || "",
            createdBy: req.user._id,
            updatedBy: req.user._id,
        }));

        const questionsDocs = await QuestionModel.insertMany(questionsData);
        console.log('✅ Questions created:', questionsDocs.length);

        // 4️⃣ Update Quiz with questions
        quiz.questions = questionsDocs.map(q => q._id);
        await quiz.save();

        console.log('✅ Quiz updated with questions');

        // Populate questions for response
        const populatedQuiz = await QuizModel.findById(quiz._id)
            .populate('questions')
            .populate('chapterId', 'title')
            .populate('createdBy', 'name email');

        console.log('=== CREATE QUIZ SUCCESS ===');

        res.status(201).json({
            success: true,
            message: "Quiz created successfully",
            quiz: populatedQuiz,
            totalQuestions: questionsDocs.length,
        });

    } catch (error: any) {
        console.error('❌ Error creating quiz:');
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error response:', error.response?.data);
        console.error('Full error:', error);

        // Handle specific error types
        if (error.code === 'ECONNREFUSED') {
            return next(ErrorHandler.createError("Python MCQ service is not available - connection refused. Make sure the Python service is running on port 8000.", 503));
        }

        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            return next(ErrorHandler.createError("Python MCQ service timeout - the PDF might be too large or complex to process. Try with a smaller file.", 504));
        }

        if (error.code === 'ECONNRESET') {
            // Typical 'socket hang up' scenario when upstream service closes connection
            return next(ErrorHandler.createError("Python MCQ service closed the connection (socket hang up). Please retry, or ensure the service remains running during processing.", 502));
        }

        if (error.response) {
            // Python service returned an error
            return next(ErrorHandler.createError(
                `MCQ generation failed: ${error.response.data?.error || error.response.statusText}`,
                error.response.status || 500
            ));
        }

        if (error.code === 'ENOTFOUND' || error.code === 'EHOSTUNREACH') {
            return next(ErrorHandler.createError("Cannot connect to MCQ generation service", 503));
        }

        // Database errors
        if (error.name === 'ValidationError') {
            return next(ErrorHandler.createError(`Database validation error: ${error.message}`, 400));
        }

        if (error.name === 'CastError') {
            return next(ErrorHandler.createError(`Invalid ID format: ${error.message}`, 400));
        }

        // Generic error
        return next(ErrorHandler.createError(
            `Failed to create quiz: ${error.message}`,
            500
        ));
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
export default { deletefolder, createfolder, updatefolder, createchapter, summarizecchapter, createquiz, getChapterSummary, getchapterquiz, getQuizQuestions, setUserQuizStatus, getchapters, getfolders, getchaptercontent };   