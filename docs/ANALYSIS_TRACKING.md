# Analysis Tracking System

## Overview
This document describes the analysis tracking system that automatically updates user activity data across the application.

## Analysis Model Structure

The `analysisModel.ts` defines the following tracked metrics:

```typescript
{
  userId: ObjectId,              // Reference to User
  recentChapters: [ObjectId],    // Last 5 chapters accessed/created
  recentFolders: [ObjectId],     // Last 5 folders accessed/created
  lastMindmaps: [ObjectId],      // Last 5 mindmaps created
  lastRank: Number,              // User's current rank (0 by default)
  totalChapters: Number,         // Total chapters created by user
  lastSummary: ObjectId,         // Most recent summary created
  avgScore: Number               // Average quiz score
}
```

## AnalysisService

Created in `src/services/analysisService.ts`, this service provides methods to update analysis data:

### Methods

1. **`updateRecentChapters(userId, chapterId)`**
   - Adds chapter to recent chapters (max 5)
   - Increments total chapter count
   - Removes duplicates and maintains chronological order

2. **`updateRecentFolders(userId, folderId)`**
   - Tracks recently accessed/created folders (max 5)
   - Maintains most recent at the front

3. **`updateLastMindmap(userId, mindmapId)`**
   - Records mindmap creation (max 5)
   - Keeps track of user's mindmap activity

4. **`updateLastSummary(userId, summaryId)`**
   - Updates the most recent summary generated

5. **`updateAvgScore(userId, newScore)`**
   - Calculates weighted average of quiz scores
   - Rounds to 2 decimal places

6. **`initializeAnalysis(userId)`**
   - Creates initial analysis document for new users
   - Called during user registration

7. **`updateUserRank(userId, rank)`**
   - Updates user's rank (for leaderboard features)

## Controller Integration

### ChapterController
- **Event**: Chapter creation
- **Updates**: 
  - `recentChapters` - adds new chapter
  - `totalChapters` - increments count
  - `recentFolders` - tracks parent folder

### FolderController
- **Event**: Folder creation
- **Updates**: 
  - `recentFolders` - adds new folder

### SummaryController
- **Event**: Summary generation
- **Updates**: 
  - `lastSummary` - stores latest summary ID

### MindmapController
- **Event**: Mindmap creation
- **Updates**: 
  - `lastMindmaps` - adds new mindmap

### QuizController
- **Event**: Quiz completion
- **Updates**: 
  - `avgScore` - calculates new average score

### UserController
- **Event**: User registration (both email and Google OAuth)
- **Updates**: 
  - Initializes empty analysis document

## Caching

All analysis updates automatically invalidate the user's analysis cache using:
```typescript
await CacheHelper.delete(CacheKeys.getAnalysisKey(userId));
```

Cache key pattern: `analysis:user:{userId}`

## AnalysisController

The `getAnalysis` endpoint retrieves user analysis data:
- Checks cache first
- Falls back to database if cache miss
- Returns all tracked metrics
- Caches result for 1 day

## Error Handling

All analysis updates are wrapped in try-catch blocks to ensure they don't interrupt main operations:
```typescript
try {
    await AnalysisService.updateRecentChapters(userId, chapterId);
} catch (e) {
    console.error("Error updating analysis:", e);
}
```

This ensures that analysis tracking failures don't break core functionality.

## Usage Example

When a user creates a chapter:
```typescript
// Chapter creation logic...

// Update analysis
await AnalysisService.updateRecentChapters(userId, chapterId);
await AnalysisService.updateRecentFolders(userId, folderId);
```

## Benefits

1. **Automatic Tracking**: No manual intervention needed
2. **Non-Blocking**: Failures don't affect main operations
3. **Cached**: Fast retrieval with 1-day TTL
4. **Comprehensive**: Tracks all major user activities
5. **Scalable**: Service-based architecture for easy extension

## Future Enhancements

Potential additions:
- Time-based analytics (daily/weekly/monthly activity)
- Study streaks tracking
- Topic/category preferences
- Performance trends over time
- Collaborative activity tracking
