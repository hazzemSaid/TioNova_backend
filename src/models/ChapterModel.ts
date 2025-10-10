import mongoose from 'mongoose';
const ChapterModel = new mongoose.Schema({
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    folderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Folder',
        required: true
    },
    title: {
        type: String,
        required: true
    }
    , description: {
        type: String,
        required: false
    }
    , content: {
        type: Buffer, // Store PDF file as binary data
        required: true
    },
    overcontent:{
        type:String,
        required:false
    },
  
    contentType: {
    type: String,
    default: "application/pdf"
}
    , createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
}
    , updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
}
    , summaryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Summary',
    required: false
}
});

export default mongoose.model('Chapter', ChapterModel);