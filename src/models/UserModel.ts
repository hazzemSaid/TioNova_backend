import bcrypt from 'bcrypt';
import mongoose, { Document, Model } from 'mongoose';

const UserSchema = new mongoose.Schema({
	username: {
		type: String,
		required: true,
		unique: true,
		trim: true,
		minlength: 3,
		maxlength: 30
	},
	email: {
		type: String,
		required: true,
		unique: true,
		lowercase: true,
		trim: true
	},
	password: {
		type: String,
		required: true,
		select: false // Don't include password in queries by default
	},
	refreshtoken: {
		type: String,
		select: false // Don't include refresh token in queries by default
	},

	// Profile information
	streak: { type: Number, default: 0 },
	profilePicture: { type: String, default: '' },
	role: { type: String, enum: ['user', 'admin'], default: 'user' },

	// Account status
	verified: { type: Boolean, default: false },
	createdAt: { type: Date, default: Date.now },
	lastLogin: { type: Date },

	// Google OAuth
	googleId: { type: String },

	// Email Verification (for new registrations)
	verificationCode: {
		type: String,
		select: false // Keep verification codes private
	},
	verificationCodeExpire: {
		type: Date,
		select: false
	},

	// Password Reset
	resetPasswordCode: {
		type: String,
		select: false
	},
	resetPasswordToken: {
		type: String,
		select: false
	},
	resetPasswordExpire: {
		type: Date,
		select: false
	},
}, {
	timestamps: true, // Adds createdAt and updatedAt automatically
});

// Indexes for better performance
UserSchema.index({ googleId: 1 });
UserSchema.index({ verificationCodeExpire: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired codes
UserSchema.index({ resetPasswordExpire: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired reset codes

// Pre-save middleware to hash password
UserSchema.pre('save', async function (next) {
	// Only hash if password is modified
	if (!this.isModified('password')) return next();

	try {
		const saltRounds = parseInt(process.env.SALT_ROUNDS as string) || 10;
		this.password = await bcrypt.hash(this.password, saltRounds);
		next();
	} catch (error) {
		next(error as Error);
	}
});

// Instance method to compare password
export interface IUser {
	username: string;
	email: string;
	password: string;
	refreshtoken?: string;
	streak?: number;
	profilePicture?: string;
	role?: 'user' | 'admin';
	verified?: boolean;
	createdAt?: Date;
	lastLogin?: Date;
	googleId?: string;
	verificationCode?: string;
	verificationCodeExpire?: Date;
	resetPasswordCode?: string;
	resetPasswordToken?: string;
	resetPasswordExpire?: Date;
}

export interface IUserDocument extends IUser, Document {
	comparePassword(candidatePassword: string): Promise<boolean>;
	toAuthJSON(): Record<string, any>;
	profile: Record<string, any>;
}

export interface IUserModel extends Model<IUserDocument> {
	findByEmailOrUsername(identifier: string): Promise<IUserDocument | null>;
	cleanupExpiredCodes(): Promise<any>;
}

// Instance method to clear sensitive fields
UserSchema.methods.toAuthJSON = function () {
	return {
		_id: this._id,
		username: this.username,
		email: this.email,
		profilePicture: this.profilePicture,
		streak: this.streak,
		verified: this.verified,
		role: this.role,
		createdAt: this.createdAt,
		lastLogin: this.lastLogin
	};
};

// Static method to find user by email or username
UserSchema.statics.findByEmailOrUsername = function (identifier) {
	return this.findOne({
		$or: [
			{ email: identifier },
			{ username: identifier }
		]
	});
};

// Static method to cleanup expired verification codes
UserSchema.statics.cleanupExpiredCodes = function () {
	const now = new Date();
	return this.updateMany(
		{
			$or: [
				{ verificationCodeExpire: { $lt: now } },
				{ resetPasswordExpire: { $lt: now } }
			]
		},
		{
			$unset: {
				verificationCode: "",
				verificationCodeExpire: "",
				resetPasswordCode: "",
				resetPasswordToken: "",
				resetPasswordExpire: ""
			}
		}
	);
};

// Virtual for user's full profile
UserSchema.virtual('profile').get(function () {
	return {
		id: this._id,
		username: this.username,
		email: this.email,
		profilePicture: this.profilePicture,
		streak: this.streak,
		verified: this.verified,
		role: this.role,
		memberSince: this.createdAt,
		lastSeen: this.lastLogin
	};
});

// Ensure virtuals are included in JSON
UserSchema.set('toJSON', { virtuals: true });

export default mongoose.model('User', UserSchema);