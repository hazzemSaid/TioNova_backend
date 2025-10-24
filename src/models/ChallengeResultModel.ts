import mongoose, { Schema, Document } from 'mongoose';

export interface IChallengeParticipantAnswer {
  questionId: mongoose.Types.ObjectId;
  selectedOption: string;
  isCorrect: boolean;
  answeredAt: Date;
}

export interface IChallengeParticipant {
  userId: mongoose.Types.ObjectId;
  username?: string;
  score: number;
  answers: IChallengeParticipantAnswer[];
}

export interface IChallengeQuestionSnapshot {
  questionId: mongoose.Types.ObjectId;
  question: string;
  options: string[];
  answer: string; // correct
}

export interface IFinalRanking {
  userId: mongoose.Types.ObjectId;
  score: number;
  rank: number;
}

export interface IChallengeResult extends Document {
  challengeCode: string;
  owner: mongoose.Types.ObjectId;
  quizId: mongoose.Types.ObjectId;
  chapterId?: mongoose.Types.ObjectId;
  status: 'waiting' | 'in-progress' | 'completed';
  participants: IChallengeParticipant[];
  questions: IChallengeQuestionSnapshot[];
  finalRankings: IFinalRanking[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

const ChallengeResultSchema = new Schema<IChallengeResult>(
  {
    challengeCode: { type: String, required: true, unique: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    chapterId: { type: Schema.Types.ObjectId, ref: 'Chapter' },
    status: {
      type: String,
      enum: ['waiting', 'in-progress', 'completed'],
      default: 'waiting',
    },
    participants: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        username: { type: String },
        score: { type: Number, default: 0 },
        answers: [
          {
            questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
            selectedOption: { type: String, required: true },
            isCorrect: { type: Boolean, required: true },
            answeredAt: { type: Date, required: true },
          },
        ],
      },
    ],
    questions: [
      {
        questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
        question: { type: String, required: true },
        options: [{ type: String, required: true }],
        answer: { type: String, required: true },
      },
    ],
    finalRankings: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        score: { type: Number, required: true },
        rank: { type: Number, required: true },
      },
    ],
    createdAt: { type: Date, default: Date.now },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IChallengeResult>('ChallengeResult', ChallengeResultSchema);