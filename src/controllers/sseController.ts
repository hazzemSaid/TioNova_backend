// controller/sseController.js

// ⬅️ مصفوفة لتخزين كل كلاينت مع الـ ID بتاعه
let clients: any[] = [];

// ✅ دالة جديدة: تبعت بيانات لـ user معين
const sendEventToUser = (userId: string, data: any) => {
	// 1. ابحث عن الكلاينت المطلوب في المصفوفة
	const userClient = clients.find(c => c.id === userId);

	// 2. لو لقيته، ابعتله البيانات
	if (userClient) {
		userClient.client.write(`data: ${JSON.stringify(data)}\n\n`);
		console.log(`Sent event to user: ${userId}`);
		return true; // تم الإرسال بنجاح
	}

	console.log(`User not found or disconnected: ${userId}`);
	return false; // الكلاينت مش موجود
};

// دالة الاتصال الرئيسية (streamUpdates) بعد التعديل
const streamUpdates = (req: any, res: any) => {
	// 1️⃣ الخطوة الأولى: إعداد الهيدرز كالعادة
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');
	res.flushHeaders();

	// 2️⃣ الخطوة الثانية: اقرأ الـ ID من الرابط
	const { userId } = req.query;
	if (!userId) {
		// لو مفيش ID، اقفل الاتصال
		res.write('data: {"error": "userId is required"}\n\n');
		return res.end();
	}

	// 3️⃣ الخطوة الثالثة: خزّن الكلاينت الجديد مع الـ ID بتاعه
	const newClient = {
		id: userId,
		client: res,
	};
	clients.push(newClient);
	console.log(`New client connected: ${userId}. Total clients: ${clients.length}`);

	// 4️⃣ الخطوة الرابعة: لما الاتصال يتقفل، امسحه من المصفوفة
	req.on('close', () => {
		clients = clients.filter(c => c.id !== userId);
		console.log(`Client disconnected: ${userId}. Total clients: ${clients.length}`);
	});
};

module.exports = {
	streamUpdates,
	sendEventToUser, // عملنا export للدالة الجديدة
};