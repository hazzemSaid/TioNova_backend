import mongoose from 'mongoose';
const SummaryModel = new mongoose.Schema({

    chapterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chapter',
        required: true
    },
    summary: {
        type: String,
        required: true
    },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Summary', SummaryModel);