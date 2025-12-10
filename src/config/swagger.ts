import swaggerIds from "swagger-jsdoc";

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
	apis: ["./src/routers/*.ts", "./src/models/*.ts", "./src/docs/*.ts"], // Path to the API docs
};

const swaggerSpec = swaggerIds(options);

export default swaggerSpec;
