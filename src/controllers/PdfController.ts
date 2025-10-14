// PdfController - Consolidated exports from refactored controllers
import FolderController from "./FolderController";
import ChapterController from "./ChapterController";
import SummaryController from "./SummaryController";
import QuizController from "./QuizController";
import MindmapController from "./MindmapController";
import ShareController from "./ShareController";

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
};

export default PdfController;
