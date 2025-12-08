import { Response } from 'express';
import { LiveChallengeService } from '../services/liveChallengeService';

export const createLiveChallenge = async (req: any, res: Response) => {
	try {
		const ownerId = req.user._id?.toString();
		const username = req.user.username || 'Owner';
		const email = req.user.email || '';
		const { chapterId } = req.body || {};

		const result = await LiveChallengeService.createChallenge(ownerId, username, email, chapterId);

		return res.status(result.statusCode).json({
			success: result.success,
			message: result.message,
			error: result.error,
			statusCode: result.statusCode,
			...result.data
		});
	} catch (err: any) {
		console.error('createLiveChallenge error:', err);
		return res.status(500).json({ success: false, error: 'Server error', statusCode: 500 });
	}
};

export const joinLiveChallenge = async (req: any, res: Response) => {
	try {
		const { challengeCode } = req.body || {};
		const userId = req.user._id?.toString();
		const username = req.user.username || 'Player';
		const email = req.user.email || '';

		const result = await LiveChallengeService.joinChallenge(userId, username, email, challengeCode);

		return res.status(result.statusCode).json({
			success: result.success,
			message: result.message,
			error: result.error,
			statusCode: result.statusCode,
			...result.data
		});
	} catch (err: any) {
		console.error('joinLiveChallenge error:', err);
		return res.status(500).json({ success: false, error: 'Server error', statusCode: 500 });
	}
};

export const disconnectFromLiveChallenge = async (req: any, res: Response) => {
	try {
		const { challengeCode } = req.body || {};
		const userId = req.user._id?.toString();

		const result = await LiveChallengeService.disconnect(userId, challengeCode);

		return res.status(result.statusCode).json({
			success: result.success,
			message: result.message,
			error: result.error,
			statusCode: result.statusCode,
			...result.data
		});
	} catch (err: any) {
		console.error('disconnectFromLiveChallenge error:', err);
		return res.status(500).json({ success: false, error: 'Server error', statusCode: 500 });
	}
};

export const startLiveChallenge = async (req: any, res: Response) => {
	try {
		const { challengeCode } = req.body || {};
		const userId = req.user._id?.toString();

		const result = await LiveChallengeService.startChallenge(userId, challengeCode);

		return res.status(result.statusCode).json({
			success: result.success,
			message: result.message,
			error: result.error,
			statusCode: result.statusCode,
			...result.data
		});
	} catch (err: any) {
		console.error('startLiveChallenge error:', err);
		return res.status(500).json({ success: false, error: 'Server error', statusCode: 500 });
	}
};

export const submitLiveAnswer = async (req: any, res: Response) => {
	try {
		const { challengeCode, answer } = req.body || {};
		const userId = req.user._id?.toString();
		const username = req.user.username || 'Player';

		const result = await LiveChallengeService.submitAnswer(userId, username, challengeCode, answer);

		return res.status(result.statusCode).json({
			success: result.success,
			message: result.message,
			error: result.error,
			statusCode: result.statusCode,
			...result.data
		});
	} catch (err: any) {
		console.error('submitLiveAnswer error:', err);
		return res.status(500).json({ success: false, error: 'Server error', statusCode: 500 });
	}
};

export const advanceLiveChallenge = async (req: any, res: Response) => {
	try {
		const { challengeCode, force } = req.body || {};
		const userId = req.user._id?.toString();

		const result = await LiveChallengeService.advanceChallenge(userId, challengeCode, force);

		return res.status(result.statusCode).json({
			success: result.success,
			message: result.message,
			error: result.error,
			statusCode: result.statusCode,
			...result.data
		});
	} catch (err: any) {
		console.error('advanceLiveChallenge error', err);
		return res.status(500).json({ success: false, error: 'Server error', statusCode: 500 });
	}
};

export const checkAndAdvanceIfExpired = async (req: any, res: Response) => {
	try {
		const { challengeCode } = req.body || {};
		const userId = req.user._id?.toString();

		const result = await LiveChallengeService.checkAndAdvance(userId, challengeCode);

		return res.status(result.statusCode).json({
			success: result.success,
			message: result.message,
			error: result.error,
			statusCode: result.statusCode,
			...result.data
		});
	} catch (err: any) {
		console.error('checkAndAdvanceIfExpired error:', err);
		return res.status(500).json({ success: false, error: 'Server error', statusCode: 500 });
	}
};