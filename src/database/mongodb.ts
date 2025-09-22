

import * as dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

export async function connectDB() {
	try {
		console.log("🔄 Attempting to connect to MongoDB...");
		console.log("📍 MongoDB URI:", process.env.MONGO_URI ? "URI is set" : "URI is missing");
		
		if (!process.env.MONGO_URI) {
			throw new Error("MONGO_URI environment variable is not set");
		}
		
		// Log the masked URI for debugging (hide password)
		const maskedUri = process.env.MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
		console.log("🔗 Connecting to:", maskedUri);
		
		await mongoose.connect(process.env.MONGO_URI as string, {
			// optional configs
			autoIndex: true,
		});
		
		console.log("✅ Connected to MongoDB successfully!");
		console.log("📊 Database name:", mongoose.connection.name);
		console.log("🌐 Connection state:", mongoose.connection.readyState);
	} catch (error) {
		console.error("❌ MongoDB connection error:", error);
		console.error("🔍 Error details:", {
			name: (error as Error).name,
			message: (error as Error).message,
			code: (error as any).code
		});
		process.exit(1);
	}
}
