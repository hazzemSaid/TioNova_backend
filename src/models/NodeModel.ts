import mongoose from "mongoose";
const NodeSchema = new mongoose.Schema({
	title: { type: String, required: true },
	icon: { type: String, default: "📘" },
	color: { type: String, default: "#3B82F6" },
	content: { type: String, default: "" },
	children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Node' }],
	isRoot: { type: Boolean, default: false }
 }, { timestamps: true });
 
 const NodeModel = mongoose.model('Node', NodeSchema);
 export default NodeModel;