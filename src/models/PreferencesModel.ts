import mongoose from "mongoose";

const preferencesSchema = new mongoose.Schema({
  studyPerDay: { type: Number, default: 2 },
  preferredStudyTimes: {
    type: String,
    enum: ["early_morning", "morning", "afternoon", "evening", "night"],
    default: "afternoon"
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
    ],
    default: ["Prepare for Exams"]
  }],
  reminderEnabled: { type: Boolean, default: true },
  reminderTimes: [{ type: String, default: ["09:00"] }],
  contentDifficulty: {
    type: String,
    enum: ["easy", "medium", "hard", "progressive"],
    default: "medium"
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true }
}, {
  timestamps: true
});

const Preferences = mongoose.model("Preferences", preferencesSchema);

 interface IPreferences {
  studyPerDay?: number;
  preferredStudyTimes?: "early_morning" | "morning" | "afternoon" | "evening" | "night";
  dailyTimeCommitmentMinutes?: number;
  daysPerWeek?: number;
  goals?: string[];
  reminderEnabled?: boolean;
  reminderTimes?: string[];
  contentDifficulty?: "easy" | "medium" | "hard" | "progressive";


}

export { IPreferences };
export default 
	  Preferences;