# TioNova Backend — Controller & Endpoint Documentation

This document provides a detailed overview of all controllers in `src/controllers`, their main endpoints, required inputs, authentication, and example requests/responses. Use this as a reference for API integration and development.

---

## Conventions
- **Authentication**: Most endpoints require JWT (Firebase) in `Authorization: Bearer <token>`.
- **Validation**: All user inputs are validated using `express-validator`.
- **Error Format**: All errors follow `{ success: false, error: string, statusCode: number }`.
- **Success Format**: `{ success: true, data: any, message?: string }`.
- **File Uploads**: Use `multipart/form-data` for PDFs, images, and voice notes.

---

## Controllers & Endpoints

### AnalysisController
- **Purpose**: Returns user dashboard/analysis (recent chapters, folders, mindmaps, summary, scores, streaks).
- **Endpoint**: `GET /api/analysis`
- **Auth**: Required
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "userId": "...",
      "recentChapters": [...],
      "recentFolders": [...],
      "lastMindmaps": [...],
      "lastSummary": {...},
      "lastRank": 0,
      "totalChapters": 0,
      "avgScore": 0,
      "profile": {...}
    }
  }
  ```

### ChapterController
- **Purpose**: Create, list, view, and delete chapters (PDF or other content).
- **Endpoints**:
  - `POST /api/chapters` — Create chapter (PDF upload or contentType)
  - `GET /api/chapters/:folderId` — List chapters in folder
  - `GET /api/chapters/content/:chapterId` — Get chapter content
  - `DELETE /api/chapters/:chapterId` — Delete chapter
- **Auth**: Required
- **Example**:
  ```bash
  curl -X POST /api/chapters \
    -H "Authorization: Bearer <token>" \
    -F "file=@chapter.pdf" -F "title=Intro" -F "folderId=..." -F "contentType=application/pdf"
  ```

### FolderController
- **Purpose**: Create, update, list, and delete folders; manage sharing.
- **Endpoints**:
  - `POST /api/folders` — Create folder
  - `PUT /api/folders` — Update folder
  - `GET /api/folders` — List folders
  - `DELETE /api/folders/:folderId` — Delete folder
- **Auth**: Required
- **Notes**: SSE notifications sent on create/update/delete/share.

### LiveChallengeController
- **Purpose**: Real-time quiz competitions (create, join, answer, advance, complete).
- **Endpoints**:
  - `POST /api/live-challenge/create` — Create challenge (body: `{ chapterId }`)
  - `POST /api/live-challenge/join` — Join challenge (body: `{ challengeCode }`)
  - `POST /api/live-challenge/start` — Start challenge (owner only)
  - `POST /api/live-challenge/submit` — Submit answer (body: `{ challengeCode, answer }`)
  - `POST /api/live-challenge/advance` — Advance to next question
  - `POST /api/live-challenge/disconnect` — Disconnect from challenge
  - `POST /api/live-challenge/check-advance` — Poll for auto-advance
- **Auth**: Required
- **Notes**: 30s per question, rankings, QR code, Firebase Realtime DB + MongoDB.

### MindmapController
- **Purpose**: Generate, update, and fetch mindmaps from chapter content (AI-powered).
- **Endpoints**:
  - `POST /api/mindmaps` — Create/regenerate mindmap (body: `{ chapterId, regenerate }`)
  - `PUT /api/mindmaps` — Update mindmap (body: `{ _id, title, chapterId, nodes }`)
  - `POST /api/mindmaps/generatecontent` — Generate notes (body: `{ text, chapterId }`)
  - `GET /api/mindmaps/:chapterId` — Get mindmap for chapter
- **Auth**: Required
- **Notes**: AI output validated as JSON; errors if parsing fails.

### NoteController
- **Purpose**: Manage notes (text, image, voice) for chapters.
- **Endpoints**:
  - `GET /api/notes/chapter/:chapterId` — List notes
  - `POST /api/notes/text` — Add text note (body: `{ title, chapterId, textContent }`)
  - `POST /api/notes/image` — Add image note (file upload)
  - `POST /api/notes/voice` — Add voice note (file upload)
  - `DELETE /api/notes/:noteId` — Delete note
- **Auth**: Required
- **Notes**: Image/voice notes uploaded to Cloudinary.

### PdfController
- **Purpose**: Consolidated export for backward compatibility; re-exports all major operations from other controllers.
- **Use-case**: Older routes referencing `PdfController` will still work.

### ProfileController
- **Purpose**: Retrieve and update user profile (streaks, stats, avatar, university).
- **Endpoints**:
  - `GET /api/profile` — Get own profile
  - `PUT /api/profile` — Update profile (body: `{ username, universityCollege }`, file upload for avatar)
  - `GET /api/profile/:userId` — Get public profile
- **Auth**: Required for own profile; public for others.

### QuizController
- **Purpose**: Generate quizzes, fetch questions, submit answers, get history.
- **Endpoints**:
  - `POST /api/quiz/create` — Generate quiz (body: `{ chapterId }`)
  - `GET /api/quiz/chapter/:chapterId` — Get quiz for chapter
  - `GET /api/quiz/:quizId/questions` — Get quiz questions
  - `POST /api/quiz/submit` — Submit answers (body: `{ quizId, chapterId, answers, timeTaken }`)
  - `POST /api/quiz/history` — Get quiz history (body: `{ chapterId }`)
- **Auth**: Required
- **Notes**: AI-generated MCQs, caching, grading, stats.

### ShareController
- **Purpose**: Search users for sharing folders, set shared users.
- **Endpoints**:
  - `GET /api/share/users?query=...&page=1&limit=20` — Search users
  - `POST /api/share/set` — Set shared users (body: `{ folderId, sharedWith }`)
- **Auth**: Required

### sseController
- **Purpose**: Real-time notifications via Server-Sent Events (SSE).
- **Endpoints**:
  - `GET /api/sse/stream?userId=<id>` — Open SSE connection
- **Notes**: Used by other controllers to push events to clients.

### SummaryController
- **Purpose**: Generate and fetch structured chapter summaries (AI-powered).
- **Endpoints**:
  - `POST /api/summary` — Generate summary (body: `{ chapterId }`)
  - `GET /api/summary/:chapterId` — Get summary
- **Auth**: Required
- **Notes**: Caching, JSON repair for AI output.

### UserController
- **Purpose**: Authentication and account lifecycle (register, verify, login, Google, password reset).
- **Endpoints**:
  - `POST /api/user/register` — Register (body: `{ username, email, password }`)
  - `POST /api/user/verify-email` — Verify email (body: `{ email, code }`)
  - `POST /api/user/resend-code` — Resend verification code (body: `{ email }`)
  - `POST /api/user/login` — Login (body: `{ email, password }`)
  - `POST /api/user/refresh-token` — Refresh JWT (body: `{ refreshToken }`)
  - `POST /api/user/google` — Google OAuth (body: `{ token }`)
  - `POST /api/user/forgot-password` — Request password reset (body: `{ email }`)
  - `POST /api/user/verify-code` — Verify reset code (body: `{ email, code }`)
  - `POST /api/user/reset-password` — Reset password (body: `{ email, code, password }`)
  - `POST /api/user/logout` — Logout
- **Auth**: Public for registration/login/reset; JWT for protected actions.
- **Response**: Auth endpoints return `{ success: true, user, token, refreshToken }`.

---

## Example Error Response
```json
{
  "success": false,
  "error": "Invalid email format",
  "statusCode": 400
}
```

## Example Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

---

## See Also
- [Project README](../README.md)
- [PDF Analysis & OCR Details](ANALYSIS_TRACKING.md)
- [API Models & Types](../src/models/)
- [Routers for Path Mapping](../src/routers/)

For further details, see the source code or open an issue for clarification.
