import asyncWrapper from "../middleware/asyncwrapper";
import AnalysisModel from "../models/analysisModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";

const getAnalysis = asyncWrapper(async (req, res, next) => {
	const userId = req.user._id || req.user.id;
	const cacheKey = CacheKeys.getAnalysisKey(userId);
	
	// Try to get cached data
	let analysisData = await CacheHelper.get(cacheKey);
	let fromCache = false;
	
	if (analysisData) {
		fromCache = true;
	} else {
		// Fetch from database with populated fields
		analysisData = await AnalysisModel.findOne({ userId })
			.populate({
				path: 'recentChapters',
				select: 'title description category createdAt'
			})
			.populate({
				path: 'recentFolders',
				select: 'title icon color category createdAt'
			})
			.populate({
				path: 'lastMindmaps',
				select: 'title createdAt'
			})
			.populate({
				path: 'lastSummary',
				select: 'chapterId createdAt'
			})
			.lean();
		
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
		
		// Cache the populated result (30 minutes)
		if (analysisData) {
			await CacheHelper.set(cacheKey, analysisData, 1800); // 30 minutes = 1800 seconds
		}
	}
	
	res.status(200).json({
		success: true,
		data: analysisData,
		cached: fromCache
	});
});

export default getAnalysis;