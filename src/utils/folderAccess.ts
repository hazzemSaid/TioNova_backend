import { IUser } from "../interfaces/IUser";
import FolderModel from "../models/FolderModel";
import ErrorHandler from "../utils/error";

/**
 * Checks if the user is the owner of the folder.
 * Throws an error if not the owner.
 */
export const verifyFolderOwnership = async (user: IUser, folderId: string) => {
	const folder = await FolderModel.findById(folderId);
	if (!folder) throw ErrorHandler.createError("Folder not found", 404);

	if (folder.ownerId.toString() !== user._id.toString()) {
		throw ErrorHandler.createError("You do not have access to this folder. Must be the owner", 403);
	}

	return folder;
};

/**
 * Gets a list of user IDs who have access to the folder (owner + shared with).
 */
export const getAffectedUsers = (folder: any): string[] => {
	return [
		folder.ownerId.toString(),
		...(folder.sharedWith || []).map((id: any) => id.toString()),
	];
};
