

import * as dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

// Cache the connection promise for serverless reuse
let cachedConnection: Promise<typeof mongoose> | null = null;

export async function connectDB() {
	// If already connected, return immediately
	if (mongoose.connection.readyState === 1) {
		return;
	}

	// If connecting, wait for the cached promise
	if (cachedConnection) {
		await cachedConnection;
		return;
	}

	try {
		
		if (!process.env.MONGO_URI) {
			throw new Error("MONGO_URI environment variable is not set");
		}
		
		// Create connection promise and cache it
		cachedConnection = mongoose.connect(process.env.MONGO_URI as string, {
			autoIndex: true,
			serverSelectionTimeoutMS: 30000, // 30 seconds to find server
			connectTimeoutMS: 30000, // 30 seconds to establish connection
			socketTimeoutMS: 45000, // 45 seconds for ongoing operations
			bufferCommands: false, // Disable buffering to fail fast
			maxPoolSize: 10,
			minPoolSize: 1, // Reduced for serverless
		});
		
		await cachedConnection;
		
	} catch (error) {
		console.error("❌ MongoDB connection error:", error);
		cachedConnection = null; // Clear cache on error
		
		// In serverless, don't exit process - let request fail gracefully
		if (!process.env.VERCEL) {
			process.exit(1);
		} else {
			throw error; // Re-throw for serverless error handling
		}
	}
}
