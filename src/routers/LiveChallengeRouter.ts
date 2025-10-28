import express from 'express';
import {
    advanceLiveChallenge,
    checkAndAdvanceIfExpired,
    createLiveChallenge,
    disconnectFromLiveChallenge,
    joinLiveChallenge,
    startLiveChallenge,
    submitLiveAnswer,
} from '../controllers/LiveChallengeController';
import verifyToken from "../middleware/verifyToken";

const router = express.Router();

// Create challenge (returns code + optional QR)
router.post('/live/challenges', verifyToken, createLiveChallenge);

// Join lobby (or reconnect if already joined)
router.post('/live/challenges/join', verifyToken, joinLiveChallenge);

// Disconnect from challenge (marks participant as inactive)
router.post('/live/challenges/disconnect', verifyToken, disconnectFromLiveChallenge);

// Start challenge (owner-only): sets current.index = 0, pushes questions with answers
router.post('/live/challenges/start', verifyToken, startLiveChallenge);

// Submit answer for current question
router.post('/live/challenges/answer', verifyToken, submitLiveAnswer);

// Advance to next question or finish (owner or force)
router.post('/live/challenges/advance', verifyToken, advanceLiveChallenge);

// Check if timer expired and auto-advance (called by frontend poll)
router.post('/live/challenges/check-advance', verifyToken, checkAndAdvanceIfExpired);

export default router;