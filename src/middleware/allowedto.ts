import { NextFunction, Request, Response } from "express";
import ErrorHandler from "../utils/error";

// تعريف نوع المستخدم (بناءً على المتوقع من المشروع)
interface UserPayload {
	role: string;
	[key: string]: any;
}

// توسيع نوع Request ليشمل user
interface AuthenticatedRequest extends Request {
	user: UserPayload;
}

const allowedTo = (...roles: string[]) => {
	return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
		const user = req.user;

		if (!roles.includes(user.role)) {
			const err = ErrorHandler.createError(
				"You are not allowed to perform this action",
				403
			);
			return next(err);
		}

		next();
	};
};

export default allowedTo;
