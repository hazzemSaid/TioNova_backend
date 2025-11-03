import mongoose from "mongoose";
/*recent chapters <ids> with ref to chapters
recent folders <ids>
last mindmaps <ids>
last rank <number>
total chapters <number>
last summary <id>
avg score <number>
*/
const analysisSchema = new mongoose.Schema({
	  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
	  recentChapters: { type: [mongoose.Schema.Types.ObjectId], ref: "Chapter", default: [] },
	  recentFolders: { type: [mongoose.Schema.Types.ObjectId], ref: "Folder", default: [] },
	  lastMindmaps: { type: [mongoose.Schema.Types.ObjectId], ref: "Mindmap", default: [] },
	  lastRank: { type: Number, default: 0 },
	  totalChapters: { type: Number, default: 0 },
	  lastSummary: { type: mongoose.Schema.Types.ObjectId, ref: "Summary", default: null },
	  avgScore: { type: Number, default: 0 },
});

const Analysis = mongoose.model("Analysis", analysisSchema);

export default Analysis;