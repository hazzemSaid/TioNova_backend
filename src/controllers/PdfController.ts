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

        // Prepare form data for the Python service
        const formData = new FormData();
        formData.append("file", chapter.content, {
            filename: "chapter.pdf",
            contentType: "application/pdf",
        });

        // Check if Python service is available
        try {
            await axios.get("http://127.0.0.1:8000/health", { timeout: 5000 });
        } catch (healthError) {
            return next(ErrorHandler.createError(
                "PDF summarization service is currently unavailable. Please try again later.",
                503
            ));
        }

        // Call the Python service with timeout
        const summaryResponse = await axios.post(
            "http://127.0.0.1:8000/summerypdf",
            formData,
            {
                headers: { ...formData.getHeaders() },
                timeout: 300000, // 5 minutes timeout for large PDFs
                maxContentLength: 50 * 1024 * 1024, // 50MB max response size
                maxBodyLength: 50 * 1024 * 1024, // 50MB max request size
            }
        );

        // Validate response
        if (!summaryResponse.data || !summaryResponse.data.summary) {
            console.error('Invalid response from PDF service:', summaryResponse.data);
            return next(ErrorHandler.createError("Failed to process PDF: Invalid response from service", 500));
        }

        // Save the summary
        const summaryModel = await SummaryModel.create({
            chapterId: chapterId,
            summary: summaryResponse.data.summary,
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
        if (error.code === 'ECONNREFUSED') {
            return next(ErrorHandler.createError(
                "PDF processing service is currently unavailable. Please try again later.",
                503
            ));
        } else if (error.code === 'ECONNABORTED') {
            return next(ErrorHandler.createError(
                "Request to PDF service timed out. The document might be too large or the service is busy.",
                504
            ));
        } else if (error.response) {
            // Handle service errors with specific status codes
            const status = error.response.status || 500;
            const message = error.response.data?.error || "Failed to process PDF";
            return next(ErrorHandler.createError(message, status));
        } else if (error.request) {
            return next(ErrorHandler.createError(
                "No response received from PDF processing service",
                502
            ));
        } else {
            return next(ErrorHandler.createError(
                error.message || "An unexpected error occurred while processing the PDF",
                500
            ));
        }
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

        // 1️⃣ Send content to Python MCQ generator
        const formData = new FormData();

        // Check if chapterContent is a file path or buffer
        let fileBuffer;
        if (typeof chapterContent === 'string') {
            console.log('📁 Content is string (file path):', chapterContent);
            if (fs.existsSync(chapterContent)) {
                fileBuffer = fs.readFileSync(chapterContent);
                console.log('✅ File read from path, size:', fileBuffer.length);
            } else {
                return next(ErrorHandler.createError("Chapter file not found", 404));
            }
        } else if (Buffer.isBuffer(chapterContent)) {
            console.log('📁 Content is buffer, size:', chapterContent.length);
            fileBuffer = chapterContent;
        } else {
            console.log('❌ Invalid content type:', typeof chapterContent);
            console.log('Content keys:', Object.keys(chapterContent || {}));
            return next(ErrorHandler.createError("Invalid chapter content format", 400));
        }

        formData.append('file', fileBuffer, {
            filename: 'chapter.pdf',
            contentType: 'application/pdf',
        });

        console.log('📤 Sending request to Python service...');

        // First check if Python service is running
        try {
            await axios.get("http://127.0.0.1:8000/health", { timeout: 5000 });
            console.log('✅ Python service is healthy');
        } catch (healthError) {
            return next(ErrorHandler.createError("Python MCQ service is not available. Please make sure the Python service is running on port 8000.", 503));
        }

        const response = await axios.post("http://127.0.0.1:8000/generate_mcq", formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 900000, // 15 minutes timeout similar to summary call
            maxContentLength: 50 * 1024 * 1024, // 50MB max response size
            maxBodyLength: 50 * 1024 * 1024, // 50MB max request size
        });

        console.log('📥 Response from Python service:', {
            status: response.status,
            success: response.data?.success,
            mcqsCount: response.data?.mcqs?.length,
            error: response.data?.error
        });

        // Check response structure
        if (!response.data.success) {
            return next(ErrorHandler.createError(
                `Python service error: ${response.data.error || 'Unknown error'}`,
                422
            ));
        }

        const mcqsFromPython = response.data.mcqs;
        if (!Array.isArray(mcqsFromPython) || mcqsFromPython.length === 0) {
            return next(ErrorHandler.createError("No questions generated from Python service", 422));
        }

        console.log('📋 Generated MCQs:', mcqsFromPython.length);

        // Validate MCQ structure
        const validMcqs = mcqsFromPython.filter((mcq, index) => {
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