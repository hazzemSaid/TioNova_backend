import { Request, Response } from "express";

type SSEClient = {
	id: string; // user id
	connId: string; // unique connection id for this response stream
	res: Response;
};

let clients: SSEClient[] = [];

export const sendEventToUser = (userId: string, data: any): boolean => {
	const userClients = clients.filter((c) => c.id === userId);
	if (userClients.length === 0) {
		console.log(`SSE: User not connected: ${userId}`);
		return false;
	}

	let sent = 0;
	userClients.forEach((userClient) => {
		try {
			userClient.res.write(`data: ${JSON.stringify(data)}\n\n`);
			sent++;
		} catch (e) {
			console.error(`SSE: Failed to send event to ${userId} (conn ${userClient.connId})`, e);
		}
	});

	console.log(`SSE: Sent event to user: ${userId} (${sent}/${userClients.length} connections)`);
	return sent > 0;
};

export const streamUpdates = (req: Request, res: Response) => {
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");

	// flushHeaders may not exist on all Response objects in certain setups
	// @ts-ignore
	if (typeof res.flushHeaders === "function") res.flushHeaders();

	const userId = String(req.query.userId || req.query.user);
	if (!userId) {
		res.write('data: {"error": "userId is required"}\n\n');
		return res.end();
	}

	// create a unique connection id for this stream so we can remove only this connection on close
	const connId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
	const newClient: SSEClient = { id: userId, connId, res };
	clients.push(newClient);
	console.log(`SSE: New client connected: ${userId} (conn ${connId}). Total clients: ${clients.length}`);

	// Send an initial handshake event
	res.write(`data: ${JSON.stringify({ message: "connected", userId })}\n\n`);

	req.on("close", () => {
		// remove only this connection (by connId) so other open tabs/devices for the same user remain connected
		clients = clients.filter((c) => c.connId !== connId);
		console.log(`SSE: Client disconnected: ${userId} (conn ${connId}). Total clients: ${clients.length}`);
	});
};

export default {
	streamUpdates,
	sendEventToUser,
};