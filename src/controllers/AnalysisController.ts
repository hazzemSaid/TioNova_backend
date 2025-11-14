import mongoose from "mongoose";
import asyncWrapper from "../middleware/asyncwrapper";
import AnalysisModel from "../models/analysisModel";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import MindmapModel from "../models/MindmapModel";
import SummaryModel from "../models/SummaryModel";
import { ProfileService } from "../services/profileService";

const getAnalysis = asyncWrapper(async (req, res, next) => {
	const userId = req.user._id || req.user.id;
	
	// Fetch fresh analysis data from database (NO CACHING)
	let analysisData = await AnalysisModel.findOne({ userId }).lean();
	
	// If no analysis document exists, create one
	if (!analysisData) {
		const newAnalysis = await AnalysisModel.create({
			userId: userId,
			recentChapters: [],
			recentFolders: [],
			lastMindmaps: [],
			lastRank: 0,
			totalChapters: 0,
			lastSummary: null,
			avgScore: 0,
		});
		
		analysisData = newAnalysis.toObject();
	}
	
	// Fetch and populate recentChapters with full details (like getchapters endpoint)
	let recentChapters = [];
	if (analysisData.recentChapters && analysisData.recentChapters.length > 0) {
		recentChapters = await ChapterModel.aggregate([
			{ 
				$match: { 
					_id: { $in: analysisData.recentChapters.map(id => new mongoose.Types.ObjectId(id)) } 
				} 
			},
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
					category: 1,
					createdAt: 1,
					createdBy: 1,
					folderId: 1,
					quizId: 1,
					summaryId: 1,
					mindmapId: 1,
					quizStatus: { $ifNull: ["$userQuizStatusObj.status", "NotTaken"] },
					quizScore: { $ifNull: ["$userQuizStatusObj.score", 0] },
					quizCompleted: {
						$cond: [{ $ifNull: ["$userQuizStatusObj", false] }, true, false],
					},
				},
			},
		]);
	}
	
	// Fetch and populate recentFolders with full details (like getfolders endpoint)
	let recentFolders = [];
	if (analysisData.recentFolders && analysisData.recentFolders.length > 0) {
		recentFolders = await FolderModel.aggregate([
			{
				$match: {
					_id: { $in: analysisData.recentFolders.map(id => new mongoose.Types.ObjectId(id)) }
				},
			},
			{
				$lookup: {
					from: "chapters",
					let: { folderId: "$_id" },
					pipeline: [
						{ $match: { $expr: { $eq: ["$folderId", "$$folderId"] } } },
						{ $project: { _id: 1 } }
					],
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
				$lookup: {
					from: "userquizstatuses",
					let: { chapterIds: "$chapters._id" },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $in: ["$chapterId", "$$chapterIds"] },
										{ $eq: ["$userId", new mongoose.Types.ObjectId(userId)] },
									],
								},
							},
						},
					],
					as: "userQuizStatusesForChapters",
				},
			},
			{
				$addFields: {
					chapterCount: { $size: "$chapters" },
					sharedWith: "$sharedUsers",
					attemptedCount: {
						$size: {
							$ifNull: [
								{
									$setUnion: [
										{
											$map: {
												input: "$userQuizStatusesForChapters",
												as: "quizStatus",
												in: "$$quizStatus.chapterId"
											}
										}, []
									]
								}, []
							]
						}
					},
					passedCount: {
						$size: {
							$filter: {
								input: "$userQuizStatusesForChapters",
								as: "quizStatus",
								cond: { $eq: ["$$quizStatus.status", "Passed"] }
							}
						}
					}
				},
			},
			{
				$project: {
					_id: 1,
					title: 1,
					description: 1,
					category: 1,
					icon: 1,
					color: 1,
					status: 1,
					ownerId: 1,
					createdAt: 1,
					updatedAt: 1,
					sharedWith: 1,
					chapterCount: 1,
					attemptedCount: 1,
					passedCount: 1,
				},
			},
		]);
	}
	
	// Fetch and populate lastMindmaps with full details (like getmindmap endpoint)
	let lastMindmaps: any[] = [];
	if (analysisData.lastMindmaps && analysisData.lastMindmaps.length > 0) {
		const rawMindmaps = await MindmapModel.find({
			_id: { $in: analysisData.lastMindmaps }
		})
		.populate('nodes')
		.lean();
		
		// Ensure chapterId remains as ObjectId (not populated)
		lastMindmaps = rawMindmaps.map((mindmap: any) => {
			// If chapterId was somehow populated, extract just the _id
			if (mindmap.chapterId && typeof mindmap.chapterId === 'object' && mindmap.chapterId._id) {
				return {
					...mindmap,
					chapterId: mindmap.chapterId._id
				};
			}
			return mindmap;
		});
	}
	
	// Fetch and populate lastSummary with full details (like getChapterSummary endpoint)
	let lastSummary: any = null;
	if (analysisData.lastSummary) {
		const rawSummary = await SummaryModel.findById(analysisData.lastSummary)
			.lean();
		
		if (rawSummary) {
			// Ensure chapterId remains as ObjectId (not populated)
			if (rawSummary.chapterId && typeof rawSummary.chapterId === 'object' && (rawSummary.chapterId as any)._id) {
				lastSummary = {
					...rawSummary,
					chapterId: (rawSummary.chapterId as any)._id
				};
			} else {
				lastSummary = rawSummary;
			}
		}
	}
	
	// Fetch profile data (streak, totals, etc.)
	const profileData = await ProfileService.getProfile(userId.toString());
	
	res.status(200).json({
		success: true,
		data: {
			userId: analysisData.userId,
			recentChapters,
			recentFolders,
			lastMindmaps,
			lastSummary,
			lastRank: analysisData.lastRank,
			totalChapters: analysisData.totalChapters,
			avgScore: analysisData.avgScore,
			profile: {
				streak: profileData?.streak || 0,
				lastActiveDate: profileData?.lastActiveDate || null,
				totalQuizzesTaken: profileData?.totalQuizzesTaken || 0,
				totalMindmapsCreated: profileData?.totalMindmapsCreated || 0,
				totalSummariesCreated: profileData?.totalSummariesCreated || 0,
				averageQuizScore: profileData?.averageQuizScore || 0
			}
		},
	});
});

export default getAnalysis;