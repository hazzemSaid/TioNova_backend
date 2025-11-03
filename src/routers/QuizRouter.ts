import { Router } from "express";
import QuizController from "../controllers/QuizController";
import verifyToken from "../middleware/verifyToken";

const QuizRouter = Router();

// Quiz operations
QuizRouter.post("/createquiz", verifyToken, QuizController.createquiz);
QuizRouter.get("/getchapterquiz/:chapterId", verifyToken, QuizController.getchapterquiz);
QuizRouter.get("/getQuizQuestions/:quizId", verifyToken, QuizController.getQuizQuestions);
QuizRouter.post("/setuserquizstatus", verifyToken, QuizController.setUserQuizStatus);
QuizRouter.post("/quizhistory", verifyToken, QuizController.quizhistory);

export default QuizRouter;
