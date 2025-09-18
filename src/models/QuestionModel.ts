import mongoose from 'mongoose';
const QuestionModel = new mongoose.Schema({
    quizId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
        required: true
    },
    question: {
        type: String,
        required: true
    }
    ,options: {
        type: [String],
        required: true
    }
    ,answer: {
        type: String,
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
});

export default mongoose.model('Question', QuestionModel);