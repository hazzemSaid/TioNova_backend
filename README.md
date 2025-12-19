<div align="center">

<img src="https://img.shields.io/badge/TioNova-Backend%20API-6366f1?style=for-the-badge&logoColor=white" alt="TioNova Backend API" />

# TioNova Backend API

### Enterprise-Grade AI-Powered Educational Platform

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.1-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.x-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-Upstash-DC382D?style=flat-square&logo=redis&logoColor=white)](https://upstash.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Serverless-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)

<br />

[**🚀 Live Demo**](https://tionova-c566b.web.app/) · [**📱 Frontend Repo**](https://github.com/hazzemSaid/TioNova_frontend) · [**📖 API Docs**](#-api-reference)

<br />

[Features](#-key-features) · [Architecture](#-system-architecture) · [Quick Start](#-getting-started) · [API Reference](#-api-reference)

<br />

---

</div>

## 📋 Table of Contents

- [About The Project](#-about-the-project)
- [Key Features](#-key-features)
- [Technology Stack](#-technology-stack)
- [System Architecture](#-system-architecture)
- [Getting Started](#-getting-started)
- [Environment Configuration](#-environment-configuration)
- [API Reference](#-api-reference)
- [Database Schema](#-database-schema)
- [Security](#-security)
- [Contributing](#-contributing)

---

## 🎯 About The Project

**TioNova Backend** is a production-ready, scalable RESTful API designed to power next-generation educational platforms. Built with enterprise-grade architecture, it seamlessly integrates cutting-edge AI technologies to deliver intelligent, personalized learning experiences.

The platform transforms traditional learning content into interactive study materials through AI-generated quizzes, visual mind maps, intelligent summaries, and real-time collaborative challenges—all backed by comprehensive analytics and progress tracking.

### Why TioNova?

| Challenge | Solution |
|-----------|----------|
| **Content Overload** | AI-powered summarization extracts key concepts |
| **Passive Learning** | Interactive quizzes with instant feedback |
| **Poor Retention** | Visual mind maps for conceptual understanding |
| **Lack of Engagement** | Real-time multiplayer challenges |
| **No Insights** | Comprehensive analytics and progress tracking |

---

## ✨ Key Features

<table>
<tr>
<td width="50%">

### 🤖 AI-Powered Intelligence

- **Smart Content Extraction**
  - PDF text extraction
  - Web page content parsing
  - Plain text support
  
- **Intelligent Quiz Generation**
  - Context-aware question creation
  - Practice mode with explanations
  - Answer validation and scoring
  
- **Dynamic Mind Maps**
  - AI-generated node structures
  - Real-time text generation
  - Interactive editing and saving

- **Smart Summaries**
  - Key points extraction
  - Markdown-formatted output
  - Chapter-level granularity

</td>
<td width="50%">

### 📊 Analytics & Insights

- **Performance Metrics**
  - Quiz scores and trends
  - Learning streaks
  - Daily/weekly progress
  
- **Activity Tracking**
  - Recent chapters and folders
  - Mindmaps and summaries created
  - Time-based analytics

- **User Rankings**
  - Performance-based ranking
  - Overall statistics

### 🎮 Real-Time Features

- **Live Challenges**
  - Firebase Realtime Database powered
  - QR code lobby joining
  - Real-time scoring
  - Dynamic leaderboards

</td>
</tr>
</table>

### Additional Capabilities

| Feature | Description |
|---------|-------------|
| **Multi-Auth Support** | Email/Password, Google OAuth, JWT tokens |
| **Content Organization** | Hierarchical folders with public/private visibility |
| **Notes System** | Text, image, and voice notes per chapter |
| **File Management** | Cloudinary integration for media storage |
| **Caching Layer** | Upstash Redis + in-memory caching for performance |
| **Rate Limiting** | API protection against abuse |
| **Real-time Updates** | SSE for long-running operations |

---

## 🛠 Technology Stack

### Core Infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│                        TioNova Backend                          │
├─────────────────────────────────────────────────────────────────┤
│  Runtime        │  Node.js 22.x                                 │
│  Language       │  TypeScript 5.8 (Strict Mode)                 │
│  Framework      │  Express 5.1                                  │
│  Database       │  MongoDB + Mongoose ODM                       │
│  Cache          │  Upstash Redis + Node-Cache                   │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Matrix

| Category | Technologies |
|----------|-------------|
| **AI/ML** | Google Gemini (gemini-2.5-flash), Anthropic Claude, NSFW.js |
| **Authentication** | JWT (jsonwebtoken), bcrypt/bcryptjs, Google OAuth 2.0 |
| **Real-time** | Firebase Realtime Database, Server-Sent Events |
| **File Processing** | Multer, Cloudinary, Canvas |
| **Email** | Resend |
| **Documentation** | Swagger/OpenAPI 3.0 (swagger-jsdoc, swagger-ui-express) |

### Key Dependencies

<details>
<summary><strong>Production Dependencies</strong></summary>

```json
{
  "@anthropic-ai/sdk": "AI content generation (Claude)",
  "@upstash/redis": "Serverless Redis client",
  "bcrypt": "Password hashing",
  "bcryptjs": "Alternative password hashing",
  "cloudinary": "Media storage",
  "express": "Web framework (v5.1)",
  "express-rate-limit": "Rate limiting",
  "express-validator": "Input validation",
  "firebase-admin": "Firebase integration",
  "fuse.js": "Fuzzy search",
  "google-auth-library": "Google OAuth",
  "jsonwebtoken": "JWT authentication",
  "mongoose": "MongoDB ODM",
  "multer": "File upload handling",
  "node-cache": "In-memory caching",
  "qrcode": "QR code generation",
  "resend": "Email delivery",

  "swagger-jsdoc": "Swagger documentation generation",
  "swagger-ui-express": "API documentation UI"
}
```

</details>

---

## 🏗 System Architecture

### High-Level Overview

```
                                    ┌─────────────────┐
                                    │   Mobile App    │
                                    │   (Flutter)     │
                                    └────────┬────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              API Gateway                                 │
│                         (Express + Middleware)                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Rate Limiting  │  CORS  │  Auth Middleware  │  Validation  │  Logging  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
           ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
           │  Controllers │  │   Services   │  │   Utilities  │
           │              │  │              │  │              │
           └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                  │                 │                 │
                  └────────────────┬┴─────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             ┌──────────┐   ┌──────────┐   ┌──────────┐
             │ MongoDB  │   │  Redis   │   │ External │
             │          │   │ (Cache)  │   │   APIs   │
             └──────────┘   └──────────┘   └──────────┘
                                                │
                                    ┌───────────┴───────────┐
                                    ▼                       ▼
                              ┌──────────┐           ┌──────────┐
                              │  Gemini  │           │Cloudinary│
                              │    AI    │           │  (CDN)   │
                              └──────────┘           └──────────┘
```

### Project Structure

```
TioNova_backend/
│
├── api/                          # Serverless entry points
│   ├── index.ts                  # Main Vercel handler
│   ├── redisClient.ts            # Upstash Redis configuration
│   └── sseRouter.ts              # Server-Sent Events router
│
├── src/
│   ├── app.ts                    # Application bootstrap
│   │
│   ├── config/                   # Configuration
│   │   └── swagger.ts            # OpenAPI configuration
│   │
│   ├── controllers/              # Request handlers (13 controllers)
│   │   ├── UserController.ts     # Authentication & users
│   │   ├── ChapterController.ts  # Content management
│   │   ├── FolderController.ts   # Folder organization
│   │   ├── QuizController.ts     # Quiz operations
│   │   ├── MindmapController.ts  # Mind map operations
│   │   ├── SummaryController.ts  # Summary generation
│   │   ├── NoteController.ts     # Notes management
│   │   ├── ProfileController.ts  # User profiles & preferences
│   │   ├── AnalysisController.ts # Analytics
│   │   ├── LiveChallengeController.ts # Real-time challenges
│   │   ├── ShareController.ts    # Content sharing
│   │   ├── PdfController.ts      # Legacy (deprecated)
│   │   └── sseController.ts      # SSE handling
│   │
│   ├── services/                 # Business logic
│   │   ├── chapterService.ts
│   │   ├── folderService.ts
│   │   ├── noteService.ts
│   │   ├── liveChallengeService.ts
│   │   ├── profileService.ts
│   │   ├── analysisService.ts
│   │   ├── firebaseChapterService.ts
│   │   └── sseService.ts
│   │
│   ├── models/                   # Mongoose schemas (14 models)
│   │   ├── UserModel.ts
│   │   ├── ChapterModel.ts
│   │   ├── FolderModel.ts
│   │   ├── QuizModel.ts
│   │   ├── QuestionModel.ts
│   │   ├── MindmapModel.ts
│   │   ├── NodeModel.ts
│   │   ├── SummaryModel.ts
│   │   ├── NoteModel.ts
│   │   ├── profileModel.ts
│   │   ├── analysisModel.ts
│   │   ├── PreferencesModel.ts
│   │   ├── UserQuizStatusModel.ts
│   │   └── ChallengeResultModel.ts
│   │
│   ├── routers/                  # Route definitions (13 routers)
│   ├── middleware/               # Express middleware
│   │   └── verifyToken.ts        # JWT authentication
│   ├── docs/                     # Swagger documentation (12 docs)
│   ├── utils/                    # Utility functions (14 utils)
│   │   ├── geminiApi.ts          # Google Gemini integration
│   │   ├── cloudinaryService.ts  # Cloudinary uploads
│   │   ├── cacheHelper.ts        # Redis caching utilities
│   │   ├── resend.ts             # Email service
│   │   ├── validation.ts         # Request validation schemas
│   │   └── ...
│   ├── types/                    # TypeScript definitions
│   └── interfaces/               # Interface definitions
│
├── dist/                         # Compiled output
├── uploads/                      # Temporary uploads
│
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | ≥ 22.x | Runtime environment |
| MongoDB | ≥ 6.0 | Primary database |
| Redis | Upstash | Caching layer (serverless) |
| npm/yarn | Latest | Package management |

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/hazzemSaid/TioNova_backend.git
cd TioNova_backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your configuration

# 4. Start development server
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with ts-node |
| `npm run dev:watch` | Start with nodemon hot-reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Start production server (dist/app.js) |
| `npm run generate-swagger` | Generate Swagger/OpenAPI specification |
| `npm run vercel-build` | Build for Vercel deployment |

---

## ⚙ Environment Configuration

Create a `.env` file in the root directory:

```env
# ═══════════════════════════════════════════════════════════════
# SERVER CONFIGURATION
# ═══════════════════════════════════════════════════════════════
PORT=3000
NODE_ENV=development

# ═══════════════════════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════════════════════
MONGO_URI=mongodb://localhost:27017/tionova

# ═══════════════════════════════════════════════════════════════
# REDIS (Upstash)
# ═══════════════════════════════════════════════════════════════
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# ═══════════════════════════════════════════════════════════════
# AUTHENTICATION
# ═══════════════════════════════════════════════════════════════
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_REFRESH_SECRET=your_refresh_token_secret_key
SALT_ROUNDS=10

# ═══════════════════════════════════════════════════════════════
# AI SERVICES (Google Gemini)
# ═══════════════════════════════════════════════════════════════
API_KEY_GEMINI=your_google_gemini_api_key

# ═══════════════════════════════════════════════════════════════
# CLOUD STORAGE (Cloudinary)
# ═══════════════════════════════════════════════════════════════
Cloudname=your_cloud_name
APIkey=your_cloudinary_api_key
APIsecret=your_cloudinary_api_secret

# ═══════════════════════════════════════════════════════════════
# EMAIL SERVICE (Resend)
# ═══════════════════════════════════════════════════════════════
RESEND_API_KEY=re_your_resend_api_key

# ═══════════════════════════════════════════════════════════════
# OAUTH (Google)
# ═══════════════════════════════════════════════════════════════
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=your_ios_client_id (optional)
GOOGLE_ANDROID_CLIENT_ID=your_android_client_id (optional)

# ═══════════════════════════════════════════════════════════════
# FIREBASE (Optional - for push notifications)
# ═══════════════════════════════════════════════════════════════
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
```

### Environment Variables Reference

<details>
<summary><strong>Complete Variable Reference</strong></summary>

| Variable | Required | Description |
|----------|:--------:|-------------|
| `PORT` | ❌ | Server port (default: 3000) |
| `NODE_ENV` | ❌ | Environment mode (development/production) |
| `MONGO_URI` | ✅ | MongoDB connection string |
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash Redis authentication token |
| `JWT_SECRET` | ✅ | JWT signing key |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token signing key |
| `SALT_ROUNDS` | ❌ | bcrypt salt rounds (default: 10) |
| `API_KEY_GEMINI` | ✅ | Google Gemini API key |
| `Cloudname` | ✅ | Cloudinary cloud name |
| `APIkey` | ✅ | Cloudinary API key |
| `APIsecret` | ✅ | Cloudinary API secret |
| `RESEND_API_KEY` | ✅ | Resend email API key |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth client ID |
| `GOOGLE_IOS_CLIENT_ID` | ❌ | Google OAuth iOS client ID |
| `GOOGLE_ANDROID_CLIENT_ID` | ❌ | Google OAuth Android client ID |
| `FIREBASE_PROJECT_ID` | ❌ | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | ❌ | Firebase service account key |
| `FIREBASE_CLIENT_EMAIL` | ❌ | Firebase client email |

</details>

---

## 📖 API Reference

### Base URL

```
Production:  https://tionova-backend.vercel.app/api/v1
Development: http://localhost:3000/api/v1
```

### Interactive Documentation

Access the **Swagger UI** at:
```
GET /api/v1/docs
```

OpenAPI JSON specification:
```
GET /api/v1/docs.json
```

### Health Check

```
GET /api/v1/health
```

### Authentication

All protected endpoints require a Bearer token:

```http
Authorization: Bearer <access_token>
```

### Endpoints Overview

<details>
<summary><strong>🔐 Authentication</strong> — <code>/api/v1/auth</code></summary>

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|:----:|
| `POST` | `/auth/register` | Register new user | ❌ |
| `POST` | `/auth/verify-email` | Verify email with code | ❌ |
| `POST` | `/auth/resend-code` | Resend verification code | ❌ |
| `POST` | `/auth/login` | Login with email/password | ❌ |
| `POST` | `/auth/google` | Google OAuth (ID token or access token) | ❌ |
| `POST` | `/auth/refresh-token` | Refresh access token | ❌ |
| `POST` | `/auth/forgot-password` | Request password reset | ❌ |
| `POST` | `/auth/verify-code` | Verify reset code | ❌ |
| `POST` | `/auth/reset-password` | Reset password | ❌ |
| `POST` | `/auth/logout` | Logout user | ✅ |

</details>

<details>
<summary><strong>📂 Folders</strong> — <code>/api/v1</code></summary>

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|:----:|
| `POST` | `/createfolder` | Create new folder | ✅ |
| `GET` | `/getfolders` | Get user's folders | ✅ |
| `GET` | `/getpublicfolders` | Get all public folders | ✅ |
| `PATCH` | `/updatefolder` | Update folder details | ✅ |
| `DELETE` | `/deletefolder/:folderId` | Delete folder | ✅ |

</details>

<details>
<summary><strong>📄 Chapters</strong> — <code>/api/v1</code></summary>

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|:----:|
| `POST` | `/createchapter` | Create chapter (multipart/form-data) | ✅ |
| `GET` | `/getchapters/:folderId` | Get chapters in folder | ✅ |
| `GET` | `/getchaptercontent/:chapterId` | Get chapter content | ✅ |
| `PATCH` | `/updatechapter/:chapterId` | Update chapter | ✅ |
| `DELETE` | `/deletechapter/:chapterId` | Delete chapter | ✅ |

**Supported Content Types:**
- `application/pdf` — PDF file upload (file field)
- `text/plain` — Plain text content
- `url/web` — Web page URL

</details>

<details>
<summary><strong>🎯 Quizzes</strong> — <code>/api/v1</code></summary>

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|:----:|
| `POST` | `/createquiz` | Generate quiz for chapter | ✅ |
| `GET` | `/getchapterquiz/:chapterId` | Get existing quiz | ✅ |
| `GET` | `/getQuizQuestions/:quizId` | Get quiz questions | ✅ |
| `POST` | `/setuserquizstatus` | Submit answers & get results | ✅ |
| `POST` | `/quizhistory` | Get quiz attempt history | ✅ |
| `POST` | `/practicemode` | Start practice mode (with answers) | ✅ |

</details>

<details>
<summary><strong>🧠 Mind Maps</strong> — <code>/api/v1</code></summary>

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|:----:|
| `POST` | `/createMindmap` | Generate mind map for chapter | ✅ |
| `GET` | `/getMindmap/:chapterId` | Get existing mind map | ✅ |
| `PATCH` | `/saveMindmap` | Save mind map changes | ✅ |
| `POST` | `/generateText` | AI text generation for nodes | ✅ |

</details>

<details>
<summary><strong>📝 Summaries</strong> — <code>/api/v1</code></summary>

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|:----:|
| `POST` | `/summarizecchapter` | Generate chapter summary | ✅ |
| `GET` | `/getChapterSummary/:chapterId` | Get existing summary | ✅ |

</details>

<details>
<summary><strong>📓 Notes</strong> — <code>/api/v1/notes</code></summary>

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|:----:|
| `GET` | `/notes/chapter/:chapterId` | Get chapter notes | ✅ |
| `POST` | `/notes/text` | Add text note | ✅ |
| `POST` | `/notes/image` | Add image note (multipart) | ✅ |
| `POST` | `/notes/voice` | Add voice note (multipart) | ✅ |
| `PATCH` | `/notes/:noteId` | Update note | ✅ |
| `DELETE` | `/notes/:noteId` | Delete note | ✅ |

</details>

<details>
<summary><strong>🎮 Live Challenges</strong> — <code>/api/v1/live/challenges</code></summary>

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|:----:|
| `POST` | `/live/challenges` | Create challenge lobby | ✅ |
| `POST` | `/live/challenges/join` | Join with code | ✅ |
| `POST` | `/live/challenges/start` | Start challenge (owner) | ✅ |
| `POST` | `/live/challenges/answer` | Submit answer | ✅ |
| `POST` | `/live/challenges/advance` | Next question (owner) | ✅ |
| `POST` | `/live/challenges/disconnect` | Leave challenge | ✅ |
| `POST` | `/live/challenges/check-advance` | Check auto-advance | ✅ |

</details>

<details>
<summary><strong>👤 Profile & Preferences</strong> — <code>/api/v1/profile</code></summary>

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|:----:|
| `GET` | `/profile` | Get own profile | ✅ |
| `PUT` | `/profile` | Update profile (multipart for avatar) | ✅ |
| `GET` | `/profile/preferences` | Get user preferences | ✅ |
| `PATCH` | `/profile/preferences` | Update preferences | ✅ |
| `GET` | `/profile/:userId` | Get public profile | ❌ |

</details>

<details>
<summary><strong>📊 Analytics</strong> — <code>/api/v1/analysis</code></summary>

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|:----:|
| `GET` | `/analysis` | Get comprehensive user analytics | ✅ |

**Response includes:**
- Recent chapters and folders
- Last mindmaps and summaries
- User ranking and streaks
- Quiz statistics
- Daily progress (today's target)

</details>

<details>
<summary><strong>🔗 Sharing</strong> — <code>/api/v1</code></summary>

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|:----:|
| `POST` | `/getAvailableUsersForShare` | Search users to share with | ✅ |
| `POST` | `/setuserssharewith` | Share folder with users | ✅ |

</details>

### Response Format

All responses follow a consistent structure:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "cached": false
}
```

**Error Response:**

```json
{
  "success": false,
  "error": "Error description",
  "statusCode": 400
}
```

---

## 🗄 Database Schema

### Entity Relationship Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Users     │────<│   Folders    │────<│   Chapters   │
└──────────────┘     └──────────────┘     └──────┬───────┘
       │                                         │
       │              ┌──────────────────┬───────┴────────┬──────────────┐
       │              ▼                  ▼                ▼              ▼
       │       ┌──────────────┐   ┌──────────────┐  ┌──────────┐  ┌──────────┐
       │       │    Notes     │   │   Quizzes    │  │ Mindmaps │  │Summaries │
       │       └──────────────┘   └──────┬───────┘  └──────────┘  └──────────┘
       │                                 │
       │                                 ▼
       │                         ┌──────────────┐
       └────────────────────────>│  Questions   │
                                 └──────────────┘
```

### Collections

| Collection | Description |
|------------|-------------|
| `users` | User accounts and authentication data |
| `profiles` | Extended user profile information |
| `preferences` | User study preferences and settings |
| `folders` | Content organization containers |
| `chapters` | Learning content and materials |
| `quizzes` | Generated quiz metadata |
| `questions` | Individual quiz questions |
| `userquizstatuses` | Quiz attempt records and scores |
| `mindmaps` | Mind map structures (nodes & edges) |
| `nodes` | Mind map node data |
| `summaries` | AI-generated chapter summaries |
| `notes` | User notes (text, image, voice) |
| `analyses` | User analytics and statistics |
| `challengeresults` | Live challenge results |

---

## 🔒 Security

### Implemented Measures

| Security Layer | Implementation |
|----------------|----------------|
| **Authentication** | JWT with access/refresh tokens |
| **Password Storage** | bcrypt with configurable salt rounds |
| **Rate Limiting** | express-rate-limit on endpoints |
| **Input Validation** | express-validator schemas |
| **CORS** | Configurable origin policies |
| **Content Moderation** | NSFW.js for image uploads |
| **Injection Protection** | Mongoose ODM parameterization |

---

## 🤝 Contributing

Contributions are welcome!

1. **Fork** the repository
2. **Create** your feature branch
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **Commit** your changes
   ```bash
   git commit -m 'feat: add amazing feature'
   ```
4. **Push** to the branch
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **Open** a Pull Request

### Commit Convention

```
feat:     New feature
fix:      Bug fix
docs:     Documentation changes
style:    Code style changes
refactor: Code refactoring
test:     Test additions/changes
chore:    Build/tooling changes
```

---

<div align="center">

### Built with passion by **hazem_said**

[![GitHub](https://img.shields.io/badge/GitHub-hazzemSaid-181717?style=for-the-badge&logo=github)](https://github.com/hazzemSaid)

[🚀 **Live Demo**](https://tionova-c566b.web.app/) · [📱 **Frontend Repo**](https://github.com/hazzemSaid/TioNova_frontend)

**[⬆ Back to Top](#tionova-backend-api)**

</div>
