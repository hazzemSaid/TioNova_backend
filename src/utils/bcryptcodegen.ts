// services/passwordService.ts
import bcrypt from "bcryptjs";

export const hash = async (password: string): Promise<string> => {
	return await bcrypt.hash(password, Number(process.env.SALT_ROUNDS));
};

export const compare = async (password: string, hash: string): Promise<boolean> => {
	return await bcrypt.compare(password, hash);
};
