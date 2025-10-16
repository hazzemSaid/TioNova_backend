import mongoose, { Document, Schema } from 'mongoose';

export interface INote extends Document {
  title: string;
  chapterId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  rawData: {
    type: 'image' | 'text' | 'voice';
    data: string; // Can be text, image URL/base64, or voice URL/base64
    meta?: Record<string, any>; // Optional metadata
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const NoteSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chapter',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rawData: {
      type: {
        type: String,
        enum: ['image', 'text', 'voice'],
        required: true,
      },
      data: { type: String, required: true },
      meta: { type: Schema.Types.Mixed },
    },
  },
  { timestamps: true }
);

export default mongoose.model<INote>('Note', NoteSchema);