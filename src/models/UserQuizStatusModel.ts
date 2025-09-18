import mongoose from "mongoose";

const UserQuizStatusSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quiz",
    required: true,
  },
  chapterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chapter",
    required: true,
  },

  status: {
    type: String,
    enum: ["NotTaken", "Passed", "Failed"],
    default: "NotTaken",
  },
  score: {
    type: Number,
    default: 0,
  },
  attempts: [
    {
      startedAt: {
        type: Date,
        default: Date.now,
      },
      completedAt: {
        type: Date,
        default: Date.now,
      },
      answers: [
        {
          questionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Question",
            required: true,
          },
          selectedOption: {
            type: String,
            required: true,
          },
          isCorrect: {
            type: Boolean,
            required: true,
          },
        },
      ],
    },
  ],
}, { timestamps: true }); // automatically adds createdAt and updatedAt

export default mongoose.model("UserQuizStatus", UserQuizStatusSchema);
