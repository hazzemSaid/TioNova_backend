import mongoose from "mongoose";
/*
streak
lastActiveDate
totla quizzes taken
total mindmaps created
total summaries created
average quiz score
activity upcoming soon 
achivement badges upcoming
username
profile picture
uni/college
*/
const profileSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
	streak: { type: Number, default: 0 },
	lastActiveDate: { type: Date, default: null },
	totalQuizzesTaken: { type: Number, default: 0 },
	totalMindmapsCreated: { type: Number, default: 0 },
	totalSummariesCreated: { type: Number, default: 0 },
	averageQuizScore: { type: Number, default: 0 },
	username: { type: String, required: true },
	profilePicture: { type: String, default: 'https://res.cloudinary.com/dr5cpch1n/image/upload/v1752943485/Unknown_person_o3xaku.jpg' },
	universityCollege: { type: String, default: null },

	preferences: {
		studyPerDay: { type: Number, default: 2 },
		preferredStudyTimes: {
			type: String,
			enum: ["early_morning", "morning", "afternoon", "evening", "night"],
			default: "morning"
		},
		dailyTimeCommitmentMinutes: { type: Number, default: 30 },
		daysPerWeek: { type: Number, default: 5 },
		goals: [{
			type: String,
			enum: [
				"Prepare for Exams",
				"Learn New Topics",
				"Review Materials",
				"Improve Grades",
				"Daily Practice",
				"Career Development"
			]
		}],
		reminderEnabled: { type: Boolean, default: true },
		reminderTimes: [{ type: String }], // e.g., ["09:00", "14:00", "19:00"]
		contentDifficulty: {
			type: String,
			enum: ["easy", "medium", "hard", "progressive"],
			default: "medium"
		}
	}
});

const Profile = mongoose.model("Profile", profileSchema);

export default Profile;