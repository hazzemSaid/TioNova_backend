

import { body } from "express-validator";

// Preferences validation
export const preferencesValidation = [
  body("studyPerDay").optional().isInt({ min: 1, max: 10 }),
  body("preferredStudyTimes").optional().isIn([
    "early_morning", "morning", "afternoon", "evening", "night"
  ]),
  body("dailyTimeCommitmentMinutes").optional().isInt({ min: 10, max: 300 }),
  body("daysPerWeek").optional().isInt({ min: 1, max: 7 }),
  body("goals").optional().isArray().custom((arr: string[]) =>
    arr.every((goal: string) => [
      "Prepare for Exams",
      "Learn New Topics",
      "Review Materials",
      "Improve Grades",
      "Daily Practice",
      "Career Development"
    ].includes(goal))
  ),
  body("reminderEnabled").optional().isBoolean(),
  body("reminderTimes").optional().isArray().custom((arr: string[]) =>
    arr.every((time: string) => /^\d{2}:\d{2}$/.test(time))
  ),
  body("contentDifficulty").optional().isIn([
    "easy", "medium", "hard", "progressive"
  ])
];

export const registerValidation = [
	body("username").notEmpty().withMessage("name is required"),
	body("email").isEmail().withMessage("email is required"),
	body("password")
		.notEmpty().withMessage("password is required")


];

export const loginValidation = [
	body("email").isEmail().withMessage("email is required"),
	body("password").notEmpty().withMessage("password is required"),
];

export const verifyEmailValidation = [
	body("email").isEmail().withMessage("email is required"),
	body("code").notEmpty().withMessage("code is required"),
];export const verifyCodeValidation = [
	body("email").isEmail().withMessage("email is required"),
	body("code").notEmpty().withMessage("code is required"),
];

export const resendVerificationCode = [
	body("email").isEmail().withMessage("email is required"),
];

export const forgotPasswordValidation = [
	body("email").isEmail().withMessage("email is required"),
];
export const googleauthtoken = [
	body("token").notEmpty().withMessage("token is required"),
]

export const resetPasswordValidation = [
	body("email").isEmail().withMessage("email is required"),
	body("password")
		.isStrongPassword({
			minLength: 8,
			minLowercase: 1,
			minUppercase: 1,
			minNumbers: 1,
			minSymbols: 1,
			returnScore: true
		})
		.withMessage("password must be strong")
		.notEmpty().withMessage("password is required")

];
