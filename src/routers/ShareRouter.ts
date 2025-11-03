import { Router } from "express";
import ShareController from "../controllers/ShareController";
import verifyToken from "../middleware/verifyToken";

const ShareRouter = Router();

// Share operations
ShareRouter.post("/getAvailableUsersForShare", verifyToken, ShareController.getAvailableUsersForShare);
ShareRouter.post("/setuserssharewith", verifyToken, ShareController.setuserssharewith);

export default ShareRouter;
