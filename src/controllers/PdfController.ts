// PdfController - Consolidated exports from refactored controllers
import ChapterController from "./ChapterController";
import FolderController from "./FolderController";
import MindmapController from "./MindmapController";
import NoteController from "./NoteController";
import QuizController from "./QuizController";
import ShareController from "./ShareController";
import SummaryController from "./SummaryController";

// Re-export all controllers as a single object for backward compatibility
const PdfController = {
    // Folder operations
    ...FolderController,
    
    // Chapter operations
    ...ChapterController,
    
    // Summary operations
    ...SummaryController,
    
    // Quiz operations
    ...QuizController,
    
    // Mindmap operations
    ...MindmapController,
    
    // Share operations
    ...ShareController,
    
    // Note operations
    ...NoteController,
};

export default PdfController;
