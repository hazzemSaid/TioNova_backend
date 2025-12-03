import { v4 as uuidv4 } from 'uuid';
import { admin } from "../utils/firebase";

const db = admin.database();

export const initChapterJob = async (userId: string) => {
	const jobId = uuidv4();
	const ref = db.ref(`chapter-creation/${userId}`);
	await ref.set({
		jobId,
		status: "processing",
		progress: 0,
		message: "Initializing chapter creation...",
		timestamp: Date.now()
	});
	return jobId;
};

export const updateChapterJobProgress = async (userId: string, progress: number, message: string, extra?: any) => {
	const ref = db.ref(`chapter-creation/${userId}`);
	await ref.update({
		progress,
		message,
		timestamp: Date.now(),
		...extra
	});
};

export const completeChapterJob = async (userId: string, chapterId: string) => {
	const ref = db.ref(`chapter-creation/${userId}`);
	await ref.update({
		status: "completed",
		progress: 100,
		message: "Chapter created successfully",
		chapterId,
		timestamp: Date.now()
	});

	// Auto-cleanup after 5 seconds
	setTimeout(() => {
		ref.remove().catch(e => console.error("Failed to remove chapter job:", e));
	}, 5000);
};

export const failChapterJob = async (userId: string, error: string) => {
	const ref = db.ref(`chapter-creation/${userId}`);
	await ref.update({
		status: "failed",
		message: "Chapter creation failed",
		error,
		timestamp: Date.now()
	});

	// Auto-cleanup after 5 seconds
	setTimeout(() => {
		ref.remove().catch(e => console.error("Failed to remove chapter job:", e));
	}, 5000);
};
