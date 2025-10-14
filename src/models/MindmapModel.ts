import mongoose from "mongoose";

const MindmapSchema = new mongoose.Schema({
	chapterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chapter', required: true },
	title: { type: String, required: true },
	nodes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Node' }],
	createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
	updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
 }, { timestamps: true });

 const MindmapModel = mongoose.model('Mindmap', MindmapSchema);
export default MindmapModel;