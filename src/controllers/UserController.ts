// Complete authentication controller with all missing functions

import { compare } from "bcryptjs";
import crypto from "crypto";
import dotenv from "dotenv";
import { validationResult } from "express-validator";
import { OAuth2Client } from "google-auth-library";
import JWT from "jsonwebtoken";
import asyncWrapper from "../middleware/asyncwrapper";
import userModel from '../models/UserModel';
import { AnalysisService } from "../services/analysisService";
import { ProfileService } from "../services/profileService";
import { hash } from "../utils/bcryptcodegen";
import ErrorHandler from "../utils/error";
import sendEmail from '../utils/gmail';
dotenv.config();

// Environment validation
const requiredEnvVars = {
	JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
	JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
	SALT_ROUNDS: process.env.SALT_ROUNDS,
	GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID
};

for (const [key, value] of Object.entries(requiredEnvVars)) {
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
}

// Optional client IDs for native platforms
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID;

const webClient = new OAuth2Client(requiredEnvVars.GOOGLE_CLIENT_ID);

// Prepare accepted audiences for Google ID token verification
const googleAudiences = [
	requiredEnvVars.GOOGLE_CLIENT_ID as string,
	GOOGLE_IOS_CLIENT_ID,
	GOOGLE_ANDROID_CLIENT_ID,
].filter(Boolean) as string[];

// Utility functions
const generateVerificationCode = (): string => {
	const MIN = 10000000;
	const MAX = 99999999;
	return Math.floor(MIN + Math.random() * (MAX - MIN + 1)).toString();
};

const generateTokens = (user: any) => {
	const payload = {
		email: user.email,
		_id: user._id,
		role: user.role || 'user',
		username: user.username
	};

	const accessToken = JWT.sign(
		payload,
		requiredEnvVars.JWT_ACCESS_SECRET as string,
		{ expiresIn: "1h" }
	);

	const refreshToken = JWT.sign(
		payload,
		requiredEnvVars.JWT_REFRESH_SECRET as string,
		{ expiresIn: "7d" }
	);

	return { accessToken, refreshToken };
};

const createUserResponse = async (user: any, accessToken: string, refreshToken: string) => {
	// Fetch profile data
	let profile = await ProfileService.getProfile(user._id.toString());

	return {
		success: true,
		user: {
			username: user.username,
			email: user.email,
			profilePicture: profile?.profilePicture || 'https://res.cloudinary.com/dr5cpch1n/image/upload/v1752943485/Unknown_person_o3xaku.jpg',
			user_id: user._id.toString(),
			streak: profile?.streak || 0,
			verified: user.verified
		},
		token: accessToken,
		refreshToken
	};
};

// Register function
const register = asyncWrapper(async (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		console.log("error here");
		return next(ErrorHandler.createError("Validation error", 422, errors.array()));
	}

	const { username, email, password } = req.body;

	// Check if user already exists
	const existingUser = await userModel.findOne({
		$or: [{ email }, { username }]
	});

	if (existingUser) {
		const field = existingUser.email === email ? 'email' : 'username';
		return next(ErrorHandler.createError(`User with this ${field} already exists`, 409));
	}

	// Generate verification code
	const verificationCode = generateVerificationCode();
	const hashedCode = await hash(verificationCode);
	const codeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

	try {
		// Send verification email first
		await sendEmail(email, verificationCode);

		// Create user (password will be hashed by pre-save middleware)
		const newUser = await userModel.create({
			username,
			email,
			password,
			verified: false,
			verificationCode: hashedCode,
			verificationCodeExpire: codeExpiry,
		});

		// ✅ Initialize analysis document for new user
		try {
			await AnalysisService.initializeAnalysis(newUser._id.toString());
			await ProfileService.initializeProfile(
				newUser._id.toString(),
				newUser.username,
				(newUser as any).profilePicture
			);
		} catch (e) {
			console.error("Error initializing analysis/profile:", e);
		}

		return res.status(200).json({
			success: true,
			message: "Registration successful. Please check your email for verification code.",
			user: { username, email }
		});
	} catch (error) {
		return next(ErrorHandler.createError("Failed to send verification email", 500, error));
	}
});

// Verify Email function
const verifyEmail = asyncWrapper(async (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return next(ErrorHandler.createError("Validation error", 422, errors.array()));
	}

	const { email, code } = req.body;

	console.log(email);
	console.log(code);
	const user = await userModel.findOne({ email }).select('+verificationCode +verificationCodeExpire');
	if (!user) {
		return next(ErrorHandler.createError("User not found", 404));
	}
	console.log(user);
	if (user.verified) {
		return next(ErrorHandler.createError("User already verified", 400));
	}

	if (!user.verificationCode || !user.verificationCodeExpire) {
		return next(ErrorHandler.createError("No verification code found", 400));
	}

	// Check if code expired
	if (new Date() > user.verificationCodeExpire) {
		return next(ErrorHandler.createError("Verification code expired", 401));
	}

	// Verify code
	const isCodeValid = await compare(code, user.verificationCode);
	if (!isCodeValid) {
		return next(ErrorHandler.createError("Invalid verification code", 401));
	}

	// Update user
	user.verified = true;
	user.verificationCode = undefined;
	user.verificationCodeExpire = undefined;
	await user.save();

	// Generate tokens
	const { accessToken, refreshToken } = generateTokens(user);
	user.refreshtoken = await hash(refreshToken);
	await user.save();

	// ✅ Ensure profile exists
	try {
		await ProfileService.initializeProfile(
			user._id.toString(),
			user.username,
			(user as any).profilePicture
		);
	} catch (e) {
		console.error("Error initializing profile on verify:", e);
	}

	const response = await createUserResponse(user, accessToken, refreshToken);
	return res.status(200).json({
		...response,
		message: "Email verified successfully"
	});
});

// Resend Verification Code function
const resendVerificationCode = asyncWrapper(async (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return next(ErrorHandler.createError("Validation error", 422, errors.array()));
	}

	const { email } = req.body;

	const user = await userModel.findOne({ email });
	if (!user) {
		return next(ErrorHandler.createError("User not found", 404));
	}

	if (user.verified) {
		return next(ErrorHandler.createError("User already verified", 400));
	}

	// Generate new verification code
	const verificationCode = generateVerificationCode();
	const hashedCode = await hash(verificationCode);
	const codeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

	try {
		// Send verification email
		await sendEmail(email, verificationCode);

		// Update user
		user.verificationCode = hashedCode;
		user.verificationCodeExpire = codeExpiry;
		await user.save();

		return res.status(200).json({
			success: true,
			message: "Verification code resent successfully"
		});
	} catch (error) {
		return next(ErrorHandler.createError("Failed to resend verification email", 500));
	}
});

// Login function
const login = asyncWrapper(async (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return next(ErrorHandler.createError("Validation error", 422, errors.array()));
	}

	const { email, password } = req.body;

	const user = await userModel.findOne({ email }).select('+password');
	if (!user) {
		return next(ErrorHandler.createError("Invalid email or password", 401));
	}

	if (!user.verified) {
		return next(ErrorHandler.createError("Please verify your email before logging in", 401));
	}

	const isPasswordValid = await compare(password, user.password);
	if (!isPasswordValid) {
		return next(ErrorHandler.createError("Invalid email or password", 401));
	}

	const { accessToken, refreshToken } = generateTokens(user);

	// Store refresh token hash
	user.refreshtoken = await hash(refreshToken);
	await user.save();

	// ✅ Ensure profile exists (for legacy users)
	try {
		await ProfileService.initializeProfile(
			user._id.toString(),
			user.username,
			(user as any).profilePicture
		);
	} catch (e) {
		console.error("Error initializing profile on login:", e);
	}

	const response = await createUserResponse(user, accessToken, refreshToken);
	return res.status(200).json(response);
});

// Refresh token function
const refreshToken = asyncWrapper(async (req, res, next) => {
	const { refreshToken } = req.body;
	console.log(refreshToken);

	if (!refreshToken) {
		return next(ErrorHandler.createError("Refresh token is required", 401));
	}

	try {
		const decoded = JWT.verify(refreshToken, requiredEnvVars.JWT_REFRESH_SECRET as string) as any;
		const user = await userModel.findById(decoded._id).select('+refreshtoken');
		console.log(decoded);
		if (!user) {
			return next(ErrorHandler.createError("User not found", 404));
		}

		// Verify the refresh token hash
		if (!user.refreshtoken) {
			return next(ErrorHandler.createError("No active session found", 401));
		}

		const isRefreshTokenValid = await compare(refreshToken, user.refreshtoken);
		if (!isRefreshTokenValid) {
			return next(ErrorHandler.createError("Invalid refresh token", 401));
		}

		const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

		// Update refresh token hash
		user.refreshtoken = await hash(newRefreshToken);
		await user.save();

		const response = await createUserResponse(user, accessToken, newRefreshToken);
		return res.status(200).json(response);
	} catch (error) {
		return next(ErrorHandler.createError("Invalid or expired refresh token", 401));
	}
});

// Google auth function - supports both ID tokens and access tokens
const googleAuth = asyncWrapper(async (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return next(ErrorHandler.createError("Validation error", 422, errors.array()));
	}

	// Accept both `token` and `idToken` (iOS clients commonly send `idToken`)
	const token = req.body.token || req.body.idToken;

	try {
		let payload;
		let isAccessToken = false;

		// Try to verify as ID token first (for mobile clients)
		try {
			const ticket = await webClient.verifyIdToken({
				idToken: token,
			});
			payload = ticket.getPayload();
			console.log('✅ Verified as ID token');
		} catch (idTokenError) {
			// If ID token verification fails, try as access token (for web clients)
			console.log('⚠️ ID token verification failed, trying as access token...');

			try {
				const response = await fetch(
					`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${token}`
				);

				if (!response.ok) {
					throw ErrorHandler.createError(`Failed to fetch user info: ${response.statusText}`, 401);
				}

				payload = await response.json();
				isAccessToken = true;
				console.log('✅ Verified as access token');
			} catch (accessTokenError) {
				console.error('❌ Both ID token and access token verification failed');
				throw ErrorHandler.createError('Invalid token', 401);
			}
		}

		// Validate payload
		if (!payload || !payload.email) {
			return next(ErrorHandler.createError("Invalid Google token: missing email", 401));
		}

		// For ID tokens, check email_verified
		// For access tokens from Google API, email is always verified
		if (!isAccessToken && !payload.email_verified) {
			return next(ErrorHandler.createError("Email not verified", 401));
		}

		// For ID tokens, validate audience (client ID)
		if (!isAccessToken) {
			if (!payload.aud || !googleAudiences.includes(payload.aud)) {
				return next(ErrorHandler.createError("Invalid Google token audience", 401, {
					actual: payload.aud,
					expectedAnyOf: googleAudiences
				}));
			}
		}

		const { email, name, picture, sub: googleId } = payload;

		let user = await userModel.findOne({ email });

		if (user) {
			// Existing user - generate new tokens
			const { accessToken, refreshToken } = generateTokens(user);
			user.refreshtoken = await hash(refreshToken);
			await user.save();

			// ✅ Ensure profile exists (for legacy users logging in with Google)
			try {
				await ProfileService.initializeProfile(
					user._id.toString(),
					user.username,
					(user as any).profilePicture
				);
			} catch (e) {
				console.error("Error initializing profile on google login:", e);
			}

			console.log(`✅ User logged in: ${email}`);
			const response = await createUserResponse(user, accessToken, refreshToken);
			return res.status(200).json(response);
		} else {
			// New user - create account
			const randomPassword = crypto.randomBytes(32).toString('hex');
			const username = name || email.split('@')[0];

			user = await userModel.create({
				username,
				email,
				profilePicture: picture,
				password: randomPassword,
				verified: true,
				googleId,
			});

			// ✅ Initialize analysis document for new Google user
			try {
				await AnalysisService.initializeAnalysis(user._id.toString());
				await ProfileService.initializeProfile(
					user._id.toString(),
					user.username,
					(user as any).profilePicture
				);
			} catch (e) {
				console.error("Error initializing analysis/profile:", e);
			}

			const { accessToken, refreshToken } = generateTokens(user);
			user.refreshtoken = await hash(refreshToken);
			await user.save();

			console.log(`✅ New user created: ${email}`);
			const response = await createUserResponse(user, accessToken, refreshToken);
			return res.status(201).json(response);
		}
	} catch (error) {
		console.error('❌ Google authentication error:', error);
		return next(ErrorHandler.createError("Google authentication failed", 401, error));
	}
});

// Forgot Password function
const forgotPassword = asyncWrapper(async (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return next(ErrorHandler.createError("Validation error", 422, errors.array()));
	}

	const { email } = req.body;
	const user = await userModel.findOne({ email });

	if (!user) {
		return res.status(200).json({
			success: true,
			message: "If this email exists, you will receive a password reset code."
		});
	}

	const resetCode = generateVerificationCode(); // 8-digit
	const hashedCode = await hash(resetCode);
	const resetExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

	const resetToken = JWT.sign(
		{ email, purpose: 'password-reset' },
		requiredEnvVars.JWT_ACCESS_SECRET as string,
		{ expiresIn: '30m' }
	);

	user.resetPasswordCode = hashedCode;
	user.resetPasswordToken = resetToken;
	user.resetPasswordExpire = resetExpiry;
	await user.save();

	try {
		await sendEmail(email, resetCode);
		return res.status(200).json({
			success: true,
			message: "Password reset code sent to your email"
		});
	} catch (error) {
		return next(ErrorHandler.createError("Failed to send reset email", 500));
	}
});

// Verify Code function (for password reset)
const verifyCode = asyncWrapper(async (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return next(ErrorHandler.createError("Validation error", 422, errors.array()));
	}

	const { email, code } = req.body;
	const user = await userModel.findOne({ email }).select('+resetPasswordCode +resetPasswordToken +resetPasswordExpire');

	if (!user || !user.resetPasswordToken || !user.resetPasswordCode) {
		return next(ErrorHandler.createError("Invalid reset request", 400));
	}

	// Check if code expired
	if (user.resetPasswordExpire && new Date() > user.resetPasswordExpire) {
		return next(ErrorHandler.createError("Reset code expired", 401));
	}

	try {
		const decoded = JWT.verify(user.resetPasswordToken, requiredEnvVars.JWT_ACCESS_SECRET as string) as any;

		if (decoded.email !== email || decoded.purpose !== 'password-reset') {
			throw ErrorHandler.createError('Invalid token', 401);
		}

		const isCodeValid = await compare(code, user.resetPasswordCode);
		if (!isCodeValid) {
			return next(ErrorHandler.createError("Invalid verification code", 401));
		}

		return res.status(200).json({
			success: true,
			message: "Code verified successfully. You can now reset your password.",
			resetToken: user.resetPasswordToken
		});
	} catch (error) {
		return next(ErrorHandler.createError("Invalid or expired reset token", 401));
	}
});

// Reset Password function
const resetPassword = asyncWrapper(async (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return next(ErrorHandler.createError("Validation error", 422, errors.array()));
	}

	const { email, code, password } = req.body;
	const user = await userModel.findOne({ email }).select('+resetPasswordCode +resetPasswordToken +resetPasswordExpire');

	if (!user || !user.resetPasswordToken) {
		return next(ErrorHandler.createError("Invalid reset request", 400));
	}

	// Check if code expired
	if (user.resetPasswordExpire && new Date() > user.resetPasswordExpire) {
		return next(ErrorHandler.createError("Reset code expired", 401));
	}

	try {
		const decoded = JWT.verify(user.resetPasswordToken, requiredEnvVars.JWT_ACCESS_SECRET as string) as any;

		if (decoded.email !== email || decoded.purpose !== 'password-reset') {
			throw ErrorHandler.createError('Invalid token', 401);
		}

		const isCodeValid = await compare(code, user.resetPasswordCode || '');
		if (!isCodeValid) {
			return next(ErrorHandler.createError("Invalid verification code", 401));
		}

		// Update password (will be hashed by pre-save middleware)
		user.password = password;

		// Cleanup reset fields
		user.resetPasswordCode = undefined;
		user.resetPasswordToken = undefined;
		user.resetPasswordExpire = undefined;
		user.refreshtoken = undefined; // invalidate sessions
		await user.save();

		// Generate new tokens
		const { accessToken, refreshToken } = generateTokens(user);
		user.refreshtoken = await hash(refreshToken);
		await user.save();

		const response = await createUserResponse(user, accessToken, refreshToken);
		return res.status(200).json({
			...response,
			message: "Password reset successfully"
		});
	} catch (error) {
		return next(ErrorHandler.createError("Invalid or expired reset token", 401));
	}
});

// Logout function
const logout = asyncWrapper(async (req, res, next) => {
	console.log(req.user);
	const userId = req.user?._id; // Assuming you have auth middleware that sets req.user
	if (userId) {
		try {
			await userModel.findByIdAndUpdate(userId, {
				$unset: { refreshtoken: 1 }
			});
		} catch (error) {
			// Log error but don't fail the logout
			console.error('Error clearing refresh token:', error);
		}
	}

	return res.status(200).json({
		success: true,
		message: "Logged out successfully"
	});
});

export default {
	register,
	verifyEmail,
	resendVerificationCode,
	forgotPassword,
	verifyCode,
	resetPassword,
	login,
	refreshToken,
	googleAuth,
	logout,
};