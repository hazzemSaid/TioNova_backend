// src/routers/UserRouter.ts
import { Router } from "express";
import { body } from "express-validator";
import AuthController from "../controllers/UserController"; // الكود الكبير اللي كتبته
import { forgotPasswordValidation, loginValidation, registerValidation, resendVerificationCode, verifyCodeValidation, verifyEmailValidation } from "../utils/validation";
import verifyToken from "../middleware/verifyToken";

const UserRouter = Router();

// Register
UserRouter.post(
	"/auth/register",
	registerValidation,
	AuthController.register
);

// Verify email
UserRouter.post(
	"/auth/verify-email",
	verifyEmailValidation,
	AuthController.verifyEmail
);

// Resend code
UserRouter.post(
	"/auth/resend-code",
	resendVerificationCode,
	AuthController.resendVerificationCode
);

// Login
UserRouter.post(
	"/auth/login",
	loginValidation, AuthController.login
);

// Refresh token
UserRouter.post("/auth/refresh-token", AuthController.refreshToken);

// Google Auth
UserRouter.post(
	"/auth/google",
	[body("token").notEmpty()],
	AuthController.googleAuth
);

// Forgot Password
UserRouter.post(
	"/auth/forgot-password",
	forgotPasswordValidation,
	AuthController.forgotPassword
);

// Verify reset code
UserRouter.post(
	"/auth/verify-code",
	verifyCodeValidation,
	AuthController.verifyCode
);

// Reset Password
UserRouter.post(
	"/auth/reset-password",
	[
		body("email").isEmail(),
		body("code").isLength({ min: 8, max: 8 }),
		body("password").isLength({ min: 6 }),
	],
	AuthController.resetPassword
);

// Logout
UserRouter.post("/auth/logout",verifyToken,AuthController.logout);

export default UserRouter;
