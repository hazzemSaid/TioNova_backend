import mongoose, { Document } from "mongoose";

export interface IUser extends Document {
	_id: mongoose.Types.ObjectId;
	username?: string;
	email?: string;
	role?: string;
}
