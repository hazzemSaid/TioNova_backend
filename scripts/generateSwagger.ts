import * as fs from "fs";
import * as path from "path";
import swaggerJsdoc from "swagger-jsdoc";

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

const swaggerSpec = swaggerJsdoc(options);

// Ensure dist directory exists
const distPath = path.join(__dirname, "..", "dist");
if (!fs.existsSync(distPath)) {
  fs.mkdirSync(distPath, { recursive: true });
}

// Write swagger spec to JSON file
const outputPath = path.join(distPath, "swagger.json");
fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));

console.log(`✅ Swagger spec generated at: ${outputPath}`);
