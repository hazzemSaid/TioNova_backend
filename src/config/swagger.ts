import swaggerIds from "swagger-jsdoc";
import * as fs from "fs";
import * as path from "path";

// Check if pre-generated swagger.json exists (for Vercel production)
const swaggerJsonPath = path.join(__dirname, "../../dist/swagger.json");
let swaggerSpec: object;

if (process.env.VERCEL && fs.existsSync(swaggerJsonPath)) {
	// Load pre-generated swagger spec in production
	swaggerSpec = JSON.parse(fs.readFileSync(swaggerJsonPath, "utf-8"));
} else {
	// Generate dynamically in development
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
			"./src/routers/*.ts",
			"./src/models/*.ts",
			"./src/docs/*.ts",
		],
	};

	swaggerSpec = swaggerIds(options);
}

export default swaggerSpec;
