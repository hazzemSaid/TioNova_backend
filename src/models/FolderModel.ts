import mongoose from 'mongoose';
const FolderModel = new mongoose.Schema({
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: {
		type: Date,
		default: Date.now
	},
	ownerId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true
	}
    , sharedWith: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'User',
        required: false
    },icon: {
        type: String,
        required: false
    },
    color: {
        type: String,
        required: false
    }
    , title: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: false
    }
    , description: {
        type: String,
        required: false
    }
    , status: {
        type: String,
        enum: ['private', 'public','share'],
        required: true
    }
});

export default mongoose.model('Folder', FolderModel);