import { Router } from "express";
import FolderController from "../controllers/FolderController";
import verifyToken from "../middleware/verifyToken";

const FolderRouter = Router();

// Folder operations
FolderRouter.post("/createfolder", verifyToken, FolderController.createfolder);
FolderRouter.patch("/updatefolder", verifyToken, FolderController.updatefolder);
FolderRouter.get("/getfolders", verifyToken, FolderController.getfolders);
FolderRouter.delete("/deletefolder/:folderId", verifyToken, FolderController.deletefolder);

export default FolderRouter;
