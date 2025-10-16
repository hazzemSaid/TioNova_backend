import { v2 as cloudinary } from 'cloudinary';
import devenv from 'dotenv';
devenv.config();
const CLOUDINARY_URL = process.env.CLOUDINARY_URL;
const Cloudname = process.env.Cloudname;
const CLOUDINARY_API_KEY = process.env.APIkey;
const CLOUDINARY_API_SECRET = process.env.APIsecret;
(async function () {

	// Configuration
	cloudinary.config({
		cloud_name: Cloudname,
		api_key: CLOUDINARY_API_KEY,
		api_secret: CLOUDINARY_API_SECRET // Click 'View API Keys' above to copy your API secret
	});


})();

/**
 * Upload file buffer to Cloudinary
 * @param buffer - File buffer from multer
 * @param folder - Folder path in Cloudinary
 * @param resourceType - 'image', 'video', 'raw', 'auto'
 * @returns Upload result with secure_url, public_id, etc.
 */
export const uploadToCloudinary = (
	buffer: Buffer,
	folder: string = 'notes',
	resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto'
): Promise<any> => {
	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{
				folder: folder,
				resource_type: resourceType,
			},
			(error, result) => {
				if (error) {
					reject(error);
				} else {
					resolve(result);
				}
			}
		);
		uploadStream.end(buffer);
	});
};

export default cloudinary;
