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
});

const Profile = mongoose.model("Profile", profileSchema);

export default Profile;