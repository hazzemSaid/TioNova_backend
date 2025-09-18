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
export default cloudinary;
