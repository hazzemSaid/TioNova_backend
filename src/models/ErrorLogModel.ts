import mongoose from "mongoose";

const errorLogSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const ErrorLog = mongoose.model("ErrorLog", errorLogSchema);

export default ErrorLog;
