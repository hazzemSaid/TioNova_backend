# TioNova Backend - Copilot Instructions

## Project Overview
TioNova is a backend application built with TypeScript, Express, and MongoDB. It provides AI-powered educational features including PDF analysis, quizzes, mindmaps, summaries, and live challenges.

## Tech Stack
- **Runtime**: Node.js 22.x
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Caching**: Redis (UpStash & ioredis)
- **Queue**: BullMQ
- **AI Services**: Anthropic Claude, Google Gemini, Groq
- **File Storage**: Cloudinary
- **Authentication**: JWT with Firebase Admin
- **Real-time**: Socket.io & SSE (Server-Sent Events)

## Code Style & Conventions

### General Guidelines
- Use TypeScript strict mode
- Follow async/await pattern, avoid callback hell
- Use meaningful variable and function names
- Add JSDoc comments for complex functions
- Handle errors properly with try-catch blocks
- Use the asyncWrapper middleware for route handlers

### File Naming
- Controllers: `PascalCaseController.ts` (e.g., `UserController.ts`)
- Models: `PascalCaseModel.ts` (e.g., `UserModel.ts`)
- Routers: `PascalCaseRouter.ts` (e.g., `UserRouter.ts`)
- Services: `camelCaseService.ts` (e.g., `analysisService.ts`)
- Utilities: `camelCase.ts` (e.g., `cacheHelper.ts`)

### Project Structure
```
src/
├── controllers/    # Request handlers
├── models/        # Mongoose schemas
├── routers/       # Express routes
├── services/      # Business logic
├── middleware/    # Custom middleware
├── utils/         # Helper functions
└── types/         # TypeScript type definitions
```

## Architecture Patterns

### Controller Pattern
```typescript
export const controllerFunction = asyncWrapper(async (req: Request, res: Response) => {
  // 1. Validate input using express-validator
  // 2. Extract data from req.body, req.params, req.query
  // 3. Call service layer or interact with models
  // 4. Return standardized JSON response
  
  // Success response
  res.status(200).json({ 
    success: true, 
    data: result 
  });
  
  // Error response (if needed manually)
  // res.status(statusCode).json({
  //   success: false,
  //   error: "Error message",
  //   statusCode: statusCode
  // });
});
```

### Error Handling
- Use `asyncWrapper` middleware for async route handlers
- Throw custom errors using the `AppError` class from `utils/error.ts`
- Always provide meaningful error messages
- **CRITICAL**: All error responses MUST follow this exact structure:
  ```typescript
  {
    success: false,
    error: string,
    statusCode: number
  }
  ```

### Validation
- Use `express-validator` for input validation
- Validate all user inputs at the route level
- Check for required fields, types, and formats

### Authentication & Authorization
- Use `verifyToken` middleware for protected routes
- Use `allowedTo` middleware for role-based access
- JWT tokens are managed via Firebase Admin SDK

## Database Guidelines

### Mongoose Models
- Define schemas with proper types and validation
- Use indexes for frequently queried fields
- Implement virtual fields when needed
- Use pre/post hooks for business logic

### Relationships
- Use MongoDB ObjectId for references
- Populate references when needed with `.populate()`
- Consider embedding vs referencing based on data access patterns

## Caching Strategy
- Use Redis for frequently accessed data
- Cache keys are defined in `utils/cache_keys.ts`
- Use `cacheHelper.ts` for cache operations
- Set appropriate TTL (Time To Live) for cached data

## API Response Format

### Success Response
```typescript
{
  success: true,
  data: any,
  message?: string
}
```

### Error Response (MANDATORY FORMAT)
**ALWAYS use this exact structure for ALL error responses:**
```typescript
{
  success: false,
  error: string,        // Error message or description
  statusCode: number    // HTTP status code (400, 401, 403, 404, 500, etc.)
}
```

**Examples:**
```typescript
// Bad Request
{
  success: false,
  error: "Invalid email format",
  statusCode: 400
}

// Unauthorized
{
  success: false,
  error: "Authentication token is missing or invalid",
  statusCode: 401
}

// Not Found
{
  success: false,
  error: "Resource not found",
  statusCode: 404
}

// Internal Server Error
{
  success: false,
  error: "An unexpected error occurred",
  statusCode: 500
}
```

## Security Practices
- Sanitize user inputs
- Use bcrypt for password hashing
- Implement rate limiting with `express-rate-limit`
- Validate JWT tokens on protected routes
- Use CORS with proper configuration
- Never commit sensitive data (use .env)

## AI Integration
- AI services are in `utils/` (geminiApi.ts, groqApi.ts)
- Handle AI API errors gracefully
- Implement retry logic for failed AI requests
- Consider rate limits for AI services

## Queue & Background Jobs
- Use BullMQ for background processing
- Jobs should be idempotent
- Handle job failures with retry mechanisms
- Log job progress and errors

## Testing
- Write tests for critical business logic
- Test API endpoints with proper authentication
- Mock external services (AI, Cloudinary, etc.)
- Test error scenarios

## Environment Variables
Required environment variables should be documented and validated at startup:
- MongoDB connection string
- Redis connection URL
- JWT secrets
- API keys (Cloudinary, AI services, etc.)
- Firebase credentials

## Deployment
- Platform: Vercel (serverless functions)
- Build command: `npm run build`
- Entry point: `api/index.ts`
- Ensure environment variables are set in Vercel dashboard

## Feature-Specific Notes

### PDF Processing
- Support OCR with Tesseract
- Handle large files with streaming
- Extract text and images efficiently

### Quiz System
- Questions support multiple types
- Track user progress and scores
- Implement time limits for challenges

### Mindmap Generation
- Generate structured mindmaps from content
- Support hierarchical node relationships
- Allow user customization

### Real-time Features
- Use Socket.io for bidirectional communication
- Use SSE for server-to-client streaming
- Maintain connection state properly

## Common Tasks

### Adding a New Feature
1. Create model in `src/models/`
2. Create controller in `src/controllers/`
3. Create router in `src/routers/`
4. Register router in `src/app.ts`
5. Add validation middleware
6. Update types if needed

### API Endpoint Template
```typescript
// Router
router.post('/endpoint', verifyToken, validate, controller.function);

// Controller
export const function = asyncWrapper(async (req: Request, res: Response) => {
  // Implementation logic here
  
  // Always return success response on completion
  res.status(200).json({ 
    success: true, 
    data: result 
  });
  
  // Errors are handled by asyncWrapper and should use the format:
  // { success: false, error: string, statusCode: number }
});
```

## Best Practices
- Keep controllers thin, move logic to services
- Use TypeScript interfaces for type safety
- Implement proper logging with Morgan
- Write self-documenting code
- Follow RESTful API conventions
- Version your APIs if breaking changes occur
- Document API endpoints with Swagger/JSDoc
- **ALWAYS** use the standardized error response format: `{ success: false, error: string, statusCode: number }`
- Never return raw error objects or different error formats

## Performance Optimization
- Use database indexes strategically
- Implement pagination for list endpoints
- Cache expensive operations
- Use streaming for large data transfers
- Optimize database queries (avoid N+1)
- Compress responses with gzip

## Monitoring & Debugging
- Use Morgan for HTTP request logging
- Log errors with context information
- Monitor Redis and MongoDB performance
- Track API response times
- Set up alerts for critical errors

---

**Remember**: Always prioritize security, scalability, and maintainability. Write code that your future self will thank you for!
