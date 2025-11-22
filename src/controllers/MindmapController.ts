import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import MindmapModel from "../models/MindmapModel";
import NodeModel from "../models/NodeModel";
import { AnalysisService } from "../services/analysisService";
import { ProfileService } from "../services/profileService";
import ErrorHandler from "../utils/error";
import { getMimeType, retryGeminiApiCall } from "../utils/geminiApi";
import { callGroqApi, extractGroqText, parseGroqJson } from "../utils/groqApi";

const createMindmap = asyncWrapper(async (req, res, next) => {
    let { chapterId, regenerate }: { chapterId: string, regenerate: boolean } = req.body;
    const user = req.user;
    if (!regenerate) {
        regenerate = false;
    }

    if (!chapterId) {
        return next(ErrorHandler.createError("chapterId is required", 400));
    }

    // ✅ Try MongoDB
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) {
        return next(ErrorHandler.createError("Chapter not found", 404));
    }

    if (chapter.mindmapId && regenerate === false) {
        const mindmapModel = await MindmapModel.findById(chapter.mindmapId)
            .populate('nodes');

        if (mindmapModel) {
            return res.status(200).json({
                success: true,
                message: "Mindmap fetched successfully",
                data: mindmapModel,
            });
        }
    }

    // ✅ Generate new mindmap - use Groq if overcontent exists, otherwise fallback to Gemini
    const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;

    if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
        return next(ErrorHandler.createError("Chapter content is missing", 400));
    }

    // Prepare system prompt
    const systemPrompt = `You are an expert knowledge extraction AI that **converts educational content into a structured flat mindmap JSON**.

Task:
- Carefully analyze the provided content and extract its conceptual hierarchy.
- Output **only valid JSON** with a flat array of nodes.
- Do not include any text, markdown, comments, or explanations outside the JSON.
- The output must be **directly parseable JSON** (no errors, no trailing commas).

Schema:

{
  "title": "Main Topic Title",
  "nodes": [
    {
      "id": "node_0",
      "title": "Machine Learning",
      "content": "Overview of machine learning concepts.",
      "icon": "🤖",
      "color": "#0084FF",
      "children": ["node_1", "node_2"],
      "isRoot": true
    },
    {
      "id": "node_1",
      "title": "Supervised Learning",
      "content": "Models trained with labeled data.",
      "icon": "📘",
      "color": "#4A90E2",
      "children": ["node_3", "node_4"]
    },
    {
      "id": "node_2",
      "title": "Unsupervised Learning",
      "content": "Models that find patterns in unlabeled data.",
      "icon": "📙",
      "color": "#50C878",
      "children": []
    },
    {
      "id": "node_3",
      "title": "Regression",
      "content": "Predicts continuous outputs.",
      "icon": "📈",
      "color": "#7ED321",
      "children": []
    },
    {
      "id": "node_4",
      "title": "Classification",
      "content": "Predicts discrete categories.",
      "icon": "🧩",
      "color": "#F5A623",
      "children": []
    }
  ]
}

Guidelines:
- Output a flat array of nodes (not nested)
- Each node has an "id" (e.g., "node_0", "node_1", etc.)
- The "children" field contains an array of child node IDs (strings), not objects
- Mark exactly ONE node with "isRoot": true (this is the main topic)
- All other nodes should NOT have the isRoot field or set it to false
- Create 8-15 total nodes covering the main concepts
- Use relevant educational emojis (📚, 📖, 📝, 🎯, 💡, 🔬, 📊, 🧮, 🔍, ⚡, 🌟, 🎓, 🤖, 📈, 🧩, etc.)
- Use distinct hex colors for visual organization:
  - Blues: #0084FF, #4A90E2, #0EA5E9, #06B6D4
  - Greens: #50C878, #7ED321, #10B981, #22C55E
  - Purples: #8B5CF6, #A855F7, #C084FC
  - Oranges: #F59E0B, #F97316, #FB923C, #F5A623
  - Reds: #EF4444, #F43F5E, #EC4899
- Keep titles concise (2-5 words maximum)
- Keep content brief and academic (1-2 sentences)
- Never output empty nodes or arrays
- Never output markdown, code fences, or explanations — only the JSON object`;

    let rawText: string;

    if (hasOvercontent) {
        // ✅ Use Groq with extracted text (fast path)
        const userPrompt = `Process the following content and generate a mindmap:\n\n${chapter.overcontent}`;

        const response = await callGroqApi({
            model: 'llama-3.3-70b-versatile' as const,
            messages: [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: userPrompt }
            ],
            temperature: 0.2,
            max_tokens: 8192,
        });

        rawText = extractGroqText(response);
    } else {
        // ✅ Fallback to Gemini with PDF (multi-modal path)
        console.log('⚠️ overcontent is null, falling back to Gemini API with PDF');

        const base64File = chapter.content.toString("base64");
        const mimeType = getMimeType("chapter.pdf", chapter.contentType);

        const geminiPrompt = `${systemPrompt}\n\nProcess the content in this PDF and generate a mindmap.`;

        const response = await retryGeminiApiCall({
            contents: [{
                parts: [
                    { text: geminiPrompt },
                    { inlineData: { mimeType, data: base64File } }
                ]
            }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
        });

        const data = await response.json();

        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
            return next(ErrorHandler.createError("No response from Gemini API", 500));
        }

        rawText = data.candidates[0].content.parts[0].text.trim();
    }

    // ✅ Parse JSON response (works for both Groq and Gemini)
    let mindmapJson;
    try {
        mindmapJson = parseGroqJson(rawText);
    } catch (error) {
        console.error("❌ Failed to parse response:", rawText);
        return next(
            ErrorHandler.createError(
                "Failed to process the mindmap. Please try again.",
                500
            )
        );
    }

    // Validate required fields
    if (!mindmapJson.title || !mindmapJson.nodes || !Array.isArray(mindmapJson.nodes)) {
        return next(ErrorHandler.createError("Mindmap JSON missing required fields (title and nodes array)", 400));
    }

    if (mindmapJson.nodes.length === 0) {
        return next(ErrorHandler.createError("Mindmap must contain at least one node", 400));
    }

    // ✅ Save nodes to MongoDB in two passes
    // First pass: Create all nodes with temporary empty children arrays
    const idToMongoId = new Map(); // Map temporary IDs to MongoDB ObjectIds
    const tempNodes = [];

    for (const nodeData of mindmapJson.nodes) {
        const nodeCreateData: any = {
            title: nodeData.title,
            icon: nodeData.icon || "📘",
            color: nodeData.color || "#3B82F6",
            content: nodeData.content || "",
            children: [], // Will be updated in second pass
            isRoot: nodeData.isRoot || false
        };

        const node = new NodeModel(nodeCreateData);
        await node.save();

        idToMongoId.set(nodeData.id, node._id);
        tempNodes.push({ node, tempChildren: nodeData.children || [] });
    }

    // Second pass: Update children references with actual MongoDB ObjectIds
    for (const { node, tempChildren } of tempNodes) {
        if (tempChildren.length > 0) {
            const childObjectIds = tempChildren
                .map((childId: string) => idToMongoId.get(childId))
                .filter((id: any) => id !== undefined);

            node.children = childObjectIds;
            await node.save();
        }
    }

    // Get all saved node IDs
    const allNodeIds = Array.from(idToMongoId.values());

    // ✅ Save mindmap in MongoDB
    const mindmapModel = await MindmapModel.create({
        chapterId,
        title: mindmapJson.title,
        nodes: allNodeIds,
        createdBy: user._id,
        updatedBy: user._id,
    });

    // Update chapter with mindmapId
    chapter.mindmapId = mindmapModel._id;
    await chapter.save();

    // Populate nodes for response
    await mindmapModel.populate('nodes');

    // ✅ Update analysis: last mindmaps
    try {
        await AnalysisService.updateLastMindmap(user._id.toString(), mindmapModel._id.toString());
        await ProfileService.incrementMindmapsCreated(user._id.toString());
        await ProfileService.logDailyActivity(user._id.toString(), 'mindmap', { chapterId });
        await ProfileService.updateStreak(user._id.toString());
    } catch (e) {
        console.error("Error updating analysis/profile:", e);
    }

    // Get updated profile with new streak
    const updatedProfile = await ProfileService.getProfile(user._id.toString());

    return res.status(200).json({
        success: true,
        message: "Mindmap created successfully",
        data: mindmapModel,
        profile: {
            streak: updatedProfile?.streak || 0,
            totalMindmapsCreated: updatedProfile?.totalMindmapsCreated || 0
        }
    });
});
const saveMindmap = asyncWrapper(async (req, res, next) => {
    const { _id, title, chapterId, nodes } = req.body;
    const user = req.user;
    const mindmap = await MindmapModel.findById(_id);
    if (!mindmap) {
        //next with error handling 
        return next(ErrorHandler.createError("Mindmap not found", 404));
    }
    if (mindmap.chapterId.toString() !== chapterId) {
        return next(ErrorHandler.createError("Chapter ID mismatch the Mind Map", 400));
    }

    // Update mindmap fields
    if (title) mindmap.title = title;

    // Validate and update nodes to ensure they conform to NodeModel schema
    if (nodes && Array.isArray(nodes)) {
        // Validate each node has required fields matching NodeModel schema
        for (const node of nodes) {
            if (!node.title) {
                return next(ErrorHandler.createError("Each node must have a title", 400));
            }
            // Ensure node structure matches NodeModel schema
            const validatedNode: any = {
                title: node.title,
                icon: node.icon || "📘",
                color: node.color || "#3B82F6",
                content: node.content || "",
                children: Array.isArray(node.children) ? node.children : [],
                isRoot: node.isRoot || false
            };

            // Update or create node in database
            if (node._id) {
                await NodeModel.findByIdAndUpdate(node._id, validatedNode);
            } else {
                const newNode = await NodeModel.create(validatedNode);
                node._id = newNode._id;
            }
        }
        mindmap.nodes = nodes.map((n: any) => n._id);
    }

    mindmap.updatedBy = user._id;

    await mindmap.save();

    return res.status(200).json({
        success: true,
        message: "Mindmap updated successfully",
        data: mindmap,
    });

});
const generatecontent = asyncWrapper(async (req, res, next) => {
    const { text, chapterId }: { text: string; chapterId: string } = req.body;

    // Validate input parameters
    if (!text || text.length < 10) {
        return next(ErrorHandler.createError("Text must be at least 10 characters long", 400));
    }
    if (!chapterId) {
        return next(ErrorHandler.createError("ChapterId is required", 400));
    }

    // Fetch and validate chapter
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) {
        return next(ErrorHandler.createError("Chapter not found", 404));
    }

    const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;

    if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
        return next(ErrorHandler.createError("Chapter content is missing", 400));
    }

    // Prepare system prompt
    const systemPrompt = `You are an expert educational content generator that creates concise, structured notes based on user input and chapter content.

Format Requirements:
- Start EACH point with a dash and space: "- "
- Format: "- First point content\\n- Second point content\\n- Third point content"
- All points should be on separate lines
- Example format:
  - First main idea here (1-2 sentences)
  - Second main idea here (1-2 sentences)
  - Third main idea here (1-2 sentences)

Guidelines:
- Keep ALL content brief and academic (1-2 sentences per point maximum)
- Focus only on the user's topic - stay relevant and concise
- Maintain academic tone with clear, direct language
- Provide 3-5 main points ONLY
- Each point should be 1-2 sentences maximum
- Be extremely concise - no lengthy explanations
- Return ONLY the generated notes (no meta-commentary or introductions)`;

    let generatedContent: string;

    if (hasOvercontent) {
        // ✅ Use Groq with extracted text (fast path)
        const userPrompt = `User's topic: "${text}"

Chapter content to analyze:
${chapter.overcontent}

Generate smart notes about "${text}" based on the chapter content above.`;

        const response = await callGroqApi({
            model: 'llama-3.3-70b-versatile' as const,
            messages: [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: userPrompt }
            ],
            temperature: 0.4,
            max_tokens: 1024,
        });

        generatedContent = extractGroqText(response);
    } else {
        // ✅ Fallback to Gemini with PDF (multi-modal path)
        console.log('⚠️ overcontent is null, falling back to Gemini API with PDF');

        const base64File = chapter.content.toString("base64");
        const mimeType = getMimeType("chapter.pdf", chapter.contentType);

        const geminiPrompt = `${systemPrompt}

User's topic: "${text}"

Chapter content is in the attached PDF.

Generate smart notes about "${text}" based on the chapter content in the PDF.`;

        const response = await retryGeminiApiCall({
            contents: [{
                parts: [
                    { text: geminiPrompt },
                    { inlineData: { mimeType, data: base64File } }
                ]
            }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
        });

        const data = await response.json();

        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
            return next(ErrorHandler.createError("No response from Gemini API", 500));
        }

        generatedContent = data.candidates[0].content.parts[0].text.trim();
    }

    return res.status(200).json({
        success: true,
        message: "Smart notes generated successfully",
        data: {
            generatedContent,
            userInput: text,
            chapterId
        }
    });
})
const getmindmap = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const user = req.user;

    // Validate user
    if (!user || !user._id) {
        return next(ErrorHandler.createError("User authentication required", 401));
    }

    // Validate chapterId
    if (!chapterId) {
        return next(ErrorHandler.createError("Chapter ID is required", 400));
    }

    // Fetch chapter
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) {
        return next(ErrorHandler.createError("Chapter not found", 404));
    }

    // Check if mindmap exists for this chapter
    if (!chapter.mindmapId) {
        return next(ErrorHandler.createError("Mindmap not found for this chapter", 404));
    }

    // Fetch mindmap with populated nodes
    const mindmapModel = await MindmapModel.findById(chapter.mindmapId)
        .populate('nodes');

    if (!mindmapModel) {
        return next(ErrorHandler.createError("Mindmap not found", 404));
    }

    return res.status(200).json({
        success: true,
        message: "Mindmap fetched successfully",
        data: mindmapModel,
    });
});
const MindmapController = {
    createMindmap, saveMindmap, generatecontent, getmindmap
};

export default MindmapController;
