import path from "path";
import swaggerIds from "swagger-jsdoc";

let swaggerSpec: object;

// Try to load pre-generated swagger spec (for Vercel production)
try {
	// This file is generated during build by scripts/generateSwagger.ts
	swaggerSpec = require("./swagger-spec.json");
} catch {
	// Fallback to dynamic generation (for local development)
	
	const options = {
		definition: {
			openapi: "3.0.0",
			info: {
				title: "TioNova API",
				version: "1.0.0",
				description: "API Documentation for TioNova Backend",
			},
			servers: [
				{
					url: "http://localhost:3000/api/v1",
					description: "Local Development Server",
				},
				{
					url: "https://tionova-backend.vercel.app/api/v1",
					description: "Production Server",
				},
			],
			components: {
				securitySchemes: {
					bearerAuth: {
						type: "http",
						scheme: "bearer",
						bearerFormat: "JWT",
					},
				},
			},
			security: [
				{
					bearerAuth: [],
				},
			],
		},
		apis: [
			path.join(__dirname, "../docs/*.ts"),
			path.join(__dirname, "../routers/*.ts"),
			path.join(__dirname, "../models/*.ts"),
		],
	};

	swaggerSpec = swaggerIds(options);
}

export default swaggerSpec;
