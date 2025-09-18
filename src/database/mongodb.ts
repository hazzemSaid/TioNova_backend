

import * as dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

export async function connectDB() {
	try {
		await mongoose.connect(process.env.MONGO_URI as string, {
			// optional configs
			autoIndex: true,
		});
		console.log("✅ Connected to MongoDB!");
	} catch (error) {
		console.error("❌ MongoDB connection error:", error);
		process.exit(1);
	}
}
