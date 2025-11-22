import mongoose from "mongoose";

/*
Profile Model - Tracks user statistics and activity
Fields:
- Basic profile: username, profilePicture, universityCollege
- Activity tracking: streak, lastActiveDate, activityLogs
- Quiz stats: totalQuizzesTaken, totalSuccessfulQuizzes, averageQuizScore
- Creation stats: totalMindmapsCreated, totalSummariesCreated, totalFoldersCreated
- Challenge stats: totalChallengesParticipated
- Preferences: preferencesId reference
*/

// ActivityLog subdocument schema for daily activity tracking
const activityLogSchema = new mongoose.Schema({
  date: { type: Date, required: true }, // Start of day timestamp
  chaptersStudied: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // Array of unique chapter IDs
  quizzesCompleted: { type: Number, default: 0 },
  timeSpentMinutes: { type: Number, default: 0 },
  challengesParticipated: { type: Number, default: 0 }
}, { _id: false });

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  streak: { type: Number, default: 0 },
  lastActiveDate: { type: Date, default: null },

  // Activity tracking
  activityLogs: { type: [activityLogSchema], default: [] },

  // Quiz statistics
  totalQuizzesTaken: { type: Number, default: 0 },
  totalSuccessfulQuizzes: { type: Number, default: 0 }, // Quizzes passed (score >= 70)
  averageQuizScore: { type: Number, default: 0 },

  // Creation statistics
  totalMindmapsCreated: { type: Number, default: 0 },
  totalSummariesCreated: { type: Number, default: 0 },
  totalFoldersCreated: { type: Number, default: 0 },

  // Challenge statistics
  totalChallengesParticipated: { type: Number, default: 0 },

  // Profile information
  username: { type: String, required: false }, // Optional to support legacy profiles
  profilePicture: { type: String, default: 'https://res.cloudinary.com/dr5cpch1n/image/upload/v1752943485/Unknown_person_o3xaku.jpg' },
  universityCollege: { type: String, default: null },

  preferencesId: { type: mongoose.Schema.Types.ObjectId, ref: "Preferences", default: null }
});

// Index for efficient date-based queries on activity logs
profileSchema.index({ 'activityLogs.date': 1 });

const Profile = mongoose.model("Profile", profileSchema);

export default Profile;