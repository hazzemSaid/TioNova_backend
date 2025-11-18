# TioNova Backend

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-22.x-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/mongodb-%2332CD32.svg?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?logo=redis&logoColor=white)](https://redis.io/)

> **TioNova Backend** is a scalable, AI-powered educational platform API. It delivers advanced PDF analysis, quiz generation, mindmaps, summaries, live challenges, and real-time collaboration for modern learning solutions. Built for reliability, security, and extensibility.

---

## Key Features
- **AI PDF Analysis**: OCR, text/image extraction, and efficient streaming for large files.
- **Quiz Engine**: Auto-generates MCQs, tracks progress, scores, and history.
- **Mindmap Generation**: Hierarchical, customizable mindmaps from content.
- **Summaries**: Structured chapter summaries with key points, definitions, flashcards.
- **Live Challenges**: Real-time quiz competitions, timers, rankings, and notifications.
- **Notes**: Text, image, and voice notes (Cloudinary integration).
- **Folders & Sharing**: Organize chapters, share folders, manage permissions.
- **User Profiles**: Streaks, stats, avatars, university info.
- **Authentication**: JWT (Firebase), Google OAuth, email verification, password reset.
- **Caching & Queues**: Redis for fast access, BullMQ for background jobs.
- **Real-time**: SSE and Socket.io for instant updates and collaboration.

---

## Technology Stack
- **Node.js 22.x**
- **TypeScript (strict mode)**
- **Express.js**
- **MongoDB + Mongoose**
- **Redis (UpStash/ioredis)**
- **Cloudinary (file/image storage)**
- **Firebase Admin (JWT auth)**
- **SSE**
- **AI Services**: Anthropic Claude, Google Gemini, Groq

---

## Project Structure
```text
api/              # Entry point, Redis, SSE
src/
  controllers/    # Request handlers (business logic)
  models/         # Mongoose schemas
  routers/        # Express routes
  services/       # Business logic
  middleware/     # Auth, async wrapper, role checks
  utils/          # Helpers, AI, cache, error, Cloudinary
  types/          # TypeScript types
  static/         # HTML for PDF viewer
uploads/          # Uploaded files
scripts/          # Seed/reset scripts
realtime-server/  # Real-time server code
```

---

## Getting Started

### Prerequisites
- Node.js 22.x
- MongoDB
- Redis (UpStash recommended)
- Cloudinary account
- Firebase project (JWT)
- API keys: Gemini, Groq, Claude

### Installation
```pwsh
# Clone the repository
git clone https://github.com/hazzemSaid/TioNova_backend.git
cd TioNova_backend

# Install dependencies
npm install
```

### Environment Setup
Create a `.env` file in the root:
```env
MONGODB_URI=your_mongodb_connection
REDIS_URL=your_redis_url
CLOUDINARY_URL=your_cloudinary_url
FIREBASE_CREDENTIALS=path_to_firebase.json
JWT_ACCESS_SECRET=your_jwt_access_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
GOOGLE_CLIENT_ID=your_google_client_id
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
CLAUDE_API_KEY=your_claude_key
```

### Build & Run
```pwsh
npm run build      # Compile TypeScript
npm start          # Start server
npm run dev        # Development mode (auto-reload)
```

---

## API Overview
See [`docs/Controllers_README.md`](docs/Controllers_README.md) for full endpoint documentation.

### Main Endpoints
- `/api/analysis` — User dashboard/analysis
- `/api/chapters` — Create/list chapters
- `/api/folders` — Manage folders
- `/api/mindmaps` — Generate/fetch mindmaps
- `/api/notes` — Add/list/delete notes
- `/api/quiz` — Generate/fetch quizzes
- `/api/summary` — Generate/fetch summaries
- `/api/live-challenge` — Real-time quiz challenges
- `/api/profile` — User profile
- `/api/share` — Folder sharing
- `/api/sse/stream` — Real-time SSE updates
- `/api/user` — Authentication (register, login, Google, password reset)

#### Response Format
- **Success**: `{ success: true, data, message? }`
- **Error**: `{ success: false, error, statusCode }`

---

## Development & Testing
- Modern async/await pattern, strict TypeScript.
- Centralized error handling and validation (`express-validator`).
- Unit and integration tests for critical logic (`tests/`).
- Mocking for external services (AI, Cloudinary, etc.).

---

## Deployment
- **Platform**: Vercel (serverless functions)
- **Entry Point**: `api/index.ts`
- **Build**: `npm run build`
- **Environment**: Set variables in Vercel dashboard

---

## Contributing
We welcome contributions from the community!

1. Fork the repository and create a feature branch.
2. Add or modify models (`src/models/`), controllers (`src/controllers/`), routers (`src/routers/`).
3. Register new routers in `src/app.ts`.
4. Add validation and update types as needed.
5. Ensure all error responses use `{ success: false, error, statusCode }`.
6. Submit a pull request with a clear description and test coverage.

---

## License
This project is licensed under the MIT License.

---

## Contact & Support
- Issues: [GitHub Issues](https://github.com/hazzemSaid/TioNova_backend/issues)
- Email: [maintainer email here]

---

## Acknowledgements
- Anthropic Claude, Google Gemini, Groq for AI services
- Cloudinary for file/image hosting
- UpStash for Redis
- Firebase for authentication

---

## Quick Links
- [Controllers & API Reference](docs/Controllers_README.md)
- [PDF Analysis & OCR](docs/ANALYSIS_TRACKING.md)

