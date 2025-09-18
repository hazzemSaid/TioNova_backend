import rateLimit from "express-rate-limit";

const limiter =(limit : number) => rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: limit, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
	keyGenerator: (req: any, res) => {
		// Use the request's IP address as the key for rate limiting
		if (req.user) {
			return req.user._id; // Assuming `req.user` contains the user's IP address
		}
		return req.ip || "::1";
	}
	,
	message: {
		status: "error",
		error: "Too many requests, please try again later.",
		statuscode: 429,
		data: "no data",
	},
});

export default limiter;