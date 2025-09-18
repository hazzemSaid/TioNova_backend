import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import ErrorHandler from "../utils/error";
// أولًا: نضيف نوع مخصص لـ req.user

const verifyToken = async (req: any, res: Response, next: NextFunction) => {
	const authHeader = req.headers["authorization"] || req.headers["Authorization"];
	if (!authHeader || typeof authHeader !== "string") {
		const err = ErrorHandler.createError("Authorization header is missing", 401);
		return next(err);
	}

	const token = authHeader.split(" ")[1];

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
		req.user = decoded;
		return next();
	} catch (error) {
		const err = ErrorHandler.createError("Invalid token", 401);
		err.data = error;
		return next(err);
	}
};

export default verifyToken;
