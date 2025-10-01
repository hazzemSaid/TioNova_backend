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

    const { chapterId, } = req.body;
    try {
        if (!chapterId) return next(ErrorHandler.createError("chapterId is required", 400));
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
//         const rawText = `
//  [
//    {
//      "question": "What does software reuse involve?",
//      "options": ["a) Analyzing software to recover its design and specification", "b) Using existing software artifacts and knowledge to build new software", "c) Creating a representation of a higher level of abstraction", "d) Breaking software down to see how it works"],
//      "answer": "b",
//      "explanation": "Software reuse focuses on leveraging existing components and knowledge to create new software, rather than solely analyzing or abstracting existing systems."
//    },
//    {
//      "question": "What is delivered at the end of a sprint in agile development?",
//      "options": ["a) Test cases for the current sprint", "b) An architectural design of the solution", "c) Wireframes for the user interface", "d) An increment of working software"],
//      "answer": "d",
//      "explanation": "The primary deliverable of a sprint is a functional increment of the software, representing progress towards the overall project goal."
//    },
//    {
//      "question": "What does a burn-down chart display?",
//      "options": ["a) The velocity of the team", "b) The capacity of the team members", "c) The amount of remaining work with respect to time", "d) How many more items can be picked up in a sprint"],
//      "answer": "c",
//      "explanation": "A burn-down chart visually represents the remaining work against time, providing a clear picture of the project's progress."
//    },
//    {
//      "question": "What is the main responsibility of a Scrum Master?",
//      "options": ["a) Tracks the backlog", "b) Arranges daily meetings", "c) Measures progress against the backlog", "d) All of the above"],
//      "answer": "d",
//      "explanation": "The Scrum Master's role encompasses tracking the backlog, facilitating meetings, and monitoring progress against sprint goals."
//    },
//    {
//      "question": "What is RAD a short form of?",
//      "options": ["a) Rapid Application Document", "b) Relative Application Development", "c) Rapid Application Development", "d) Relative Application Document"],
//      "answer": "c",
//      "explanation": "RAD stands for Rapid Application Development, a software development methodology emphasizing speed and iterative development."
//    },
//    {
//      "question": "When is software delivered to the customer and payment received?",
//      "options": ["a) User story completion", "b) Iteration completion", "c) Milestone achievement", "d) All of the above"],
//      "answer": "c",
//      "explanation": "Software delivery and payment typically coincide with the completion of significant milestones, marking progress and value delivery."
//    },
//    {
//      "question": "Which of the following is a type of cloud computing service?",
//      "options": ["a) Software-as-a-Service (SaaS)", "b) Software-and-a-Server (SaaS)", "c) Service-as-a-Software (SaaS)", "d) Service-as-a-Server (SaaS)"],
//      "answer": "a",
//      "explanation": "Software as a Service (SaaS) is a common cloud computing model where software is licensed on a subscription basis and accessed over the internet."
//    },
//    {
//      "question": "What is the process of establishing service requirements and constraints?",
//      "options": ["a) Software specification", "b) Design and implementation", "c) Verification and validation", "d) System Engineering"],
//      "answer": "a",
//      "explanation": "Software specification defines the required services and constraints, forming the foundation for subsequent design and development phases."
//    },
//    {
//      "question": "What is the typical format of a user story?",
//      "options": ["a) I want <functionality>", "b) As a <type of user>, I want <functionality>", "c) As a <type of user>, I want <functionality> so that <reason>", "d) All of the above"],
//      "answer": "c",
//      "explanation": "The most comprehensive user story format includes the user role, desired functionality, and the reason behind the need."
//    },
//    {
//      "question": "What is the process of gathering, analyzing, and documenting software requirements called?",
//      "options": ["a) Feasibility Study", "b) Requirement Gathering", "c) Requirement Engineering", "d) System Requirements Specification"],
//      "answer": "c",
//      "explanation": "Requirement engineering is the systematic process of eliciting, analyzing, specifying, and validating software requirements."
//    }
//  ]
// `;
//         console.log('Gemini raw MCQ response:', rawText);
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
           title: chapter.title,
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
            .populate({ path: 'questions', select: 'question options createdAt updatedAt' })
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
    // Expected body:
    // {
    //   quizId: string,
    //   chapterId: string,
    //   answers: [{ questionId: string, answer: string }]
    // }
    const userId = req.user._id;
    const { quizId, chapterId, answers } = req.body || {};
    if (!quizId) return next(ErrorHandler.createError("quizId is required", 400));
    if (!chapterId) return next(ErrorHandler.createError("chapterId is required", 400));
    if (!Array.isArray(answers) || answers.length === 0) {
        return next(ErrorHandler.createError("answers must be a non-empty array", 400));
    }

    const quiz = await QuizModel.findById(quizId);
    if (!quiz) return next(ErrorHandler.createError("Quiz not found", 404));
    if (quiz.chapterId.toString() !== chapterId.toString()) {
        return next(ErrorHandler.createError("quizId does not belong to provided chapterId", 400));
    }

    // Load all quiz questions
    const questionIds = quiz.questions.map((qId: any) => new mongoose.Types.ObjectId(qId));
    const questions = await QuestionModel.find({ _id: { $in: questionIds } });
    const questionIdToDoc: Record<string, any> = {};
    for (const q of questions) {
        questionIdToDoc[q._id.toString()] = q;
    }

    // Normalize and grade answers
    const gradedAnswers: Array<{ questionId: any; selectedOption: string; isCorrect: boolean; correctAnswer?: string; explanation?: string; question?: string; options?: string[]; }> = [];
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
            options: qDoc.options
        });
    }

    const totalQuestions = questions.length;
    const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const passThreshold = 70; // configurable
    const status = scorePercent >= passThreshold ? "Passed" : "Failed";

    // Upsert user quiz status with a new attempt
    const attempt = {
        startedAt: new Date(),
        completedAt: new Date(),
        answers: gradedAnswers
    } as any;

    const userQuizStatus = await UserQuizStatusModel.findOneAndUpdate(
        { userId: userId, quizId: quizId, chapterId: chapterId },
        {
            $set: { status: status, score: scorePercent },
            $push: { attempts: attempt }
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
            gradedAnswers
        },
        userQuizStatus
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
        folder: {
            '_id': folder._id,
            'title': folder.title,
            'description': folder.description,
            'status': folder.status,
            'sharedWith': folder.sharedWith,
            'icon': folder.icon,
            'color': folder.color,
            'category': folder.category,
            'createdAt': folder.createdAt,
            'ownerId': folder.ownerId
            , 'chapterCount': 0,
        },
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
});
const quizhistory = asyncWrapper(async (req, res, next) => {
    const userId = req.user._id;
    const { chapterId } = req.body || {};
    
    if (!chapterId) {
        return next(ErrorHandler.createError("chapterId is required", 400));
    }

    const statusDocs = await UserQuizStatusModel.find({ userId, chapterId })
        .populate({
            path: 'attempts.answers.questionId',
            model: 'Question',
            select: 'question options answer'
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
                passRate: 0
            }
        });
    }

    const passThreshold = 70;
    
    // Flatten all attempts from all status documents
    const allAttempts = statusDocs.flatMap((status: any) => status.attempts || []);
    
    // Compute per-attempt score (degree) and state
    const attemptsWithDegree = allAttempts.map((attempt: any) => {
        const answers = attempt.answers || [];
        let correctCount = 0;
        
        for (const a of answers) {
            const qDoc = a.questionId; // populated doc
            const correct = (qDoc?.answer || '').toString().trim().toLowerCase();
            const selected = (a.selectedOption || '').toString().trim().toLowerCase();
            if (selected === correct) correctCount += 1;
        }
        
        const total = answers.length;
        const degree = total > 0 ? Math.round((correctCount / total) * 100) : 0;
        const state = degree >= passThreshold ? "Passed" : "Failed";
        
        return {
            startedAt: attempt.startedAt,
            completedAt: attempt.completedAt,
            totalQuestions: total,
            correct: correctCount,
            degree,
            state,
            answers: answers.map((a: any) => ({
                question: a.questionId?.question,
                options: a.questionId?.options,
                correctAnswer: a.questionId?.answer,
                selectedOption: a.selectedOption,
                isCorrect: a.isCorrect
            }))
        };
    });

    // Aggregate stats
    const totalAttempts = attemptsWithDegree.length;
    const bestScore = totalAttempts > 0 ? Math.max(...attemptsWithDegree.map(a => a.degree)) : 0;
    const averageScore = totalAttempts > 0 
        ? Math.round(attemptsWithDegree.reduce((s, a) => s + a.degree, 0) / totalAttempts) 
        : 0;
    const passCount = attemptsWithDegree.filter(a => a.state === "Passed").length;
    const passRate = totalAttempts > 0 ? Math.round((passCount / totalAttempts) * 100) : 0;

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
            passRate
        }
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
                from: 'userquizstatuses',
                let: { chapterId: '$_id' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ['$chapterId', '$$chapterId'] },
                                    { $eq: ['$userId', new mongoose.Types.ObjectId(user._id)] }
                                ]
                            }
                        }
                    },
                    { $sort: { updatedAt: -1 } },
                    { $limit: 1 }
                ],
                as: 'userQuizStatus'
            }
        },
        { $addFields: { userQuizStatusObj: { $arrayElemAt: ['$userQuizStatus', 0] } } },
        {
            $project: {
                _id: 1,
                title: 1,
                description: 1,
                createdAt: 1,
                createdBy: 1,
                summaryId: 1,
                // Extract just the status from the userQuizStatus object or return "NotTaken" if not found
                quizStatus: { $ifNull: ['$userQuizStatusObj.status', 'NotTaken'] },
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
const deletechapter = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const userId = req.user._id;
    const chapter = await ChapterModel.findById(chapterId );
      if(chapter == null){
        return next(ErrorHandler.createError("chapter not found", 404, []));
    }
    const folderId = chapter.folderId;
    const folder = await FolderModel.findById( folderId );
    if (folder!.ownerId != userId) {
        return next(ErrorHandler.createError("you not have access to delete it chapter Must be the owner of file ", 404, []));
    }
    await chapter?.deleteOne();
    return res.status(200).json({
        success: true,
        message: "chapter deleted  successfully",
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
    quizhistory,
    getchapters,
    getfolders,
    getchaptercontent,
    deletechapter
};

export default PdfController;