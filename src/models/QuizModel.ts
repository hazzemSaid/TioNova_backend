import mongoose from 'mongoose';
const QuizModel = new mongoose.Schema({
	
    chapterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chapter',
        required: true
    },
    title: {
        type: String,
        required: true
    }
    ,questions: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'Question',
        required: true
    }
    ,createdAt: {
        type: Date,
        default: Date.now
    }
    ,updatedAt: {
        type: Date,
        default: Date.now
    }
    ,createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
    ,updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});

export default mongoose.model('Quiz', QuizModel);