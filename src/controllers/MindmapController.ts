import mongoose from "mongoose";
import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import MindmapModel from "../models/MindmapModel";
import NodeModel from "../models/NodeModel";
import { AnalysisService } from "../services/analysisService";
import { ProfileService } from "../services/profileService";
import ErrorHandler from "../utils/error";
import { callOpenRouterApi, extractOpenRouterText } from "../utils/openRouterApi";

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

    // ✅ Generate new mindmap - Always use Gemini (Unified path)
    const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;

    if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
        return next(ErrorHandler.createError("Chapter content is missing", 400));
    }

    // Prepare system prompt
    const systemPrompt = `You are an expert at converting educational content into visual mindmaps.

TASK: Create a structured flat mindmap JSON from the provided content.

OUTPUT SCHEMA:
{
  "title": "Main Topic",
  "nodes": [
    {
      "id": "node_0",
      "title": "Main Topic",
      "content": "Brief overview of this topic.",
      "icon": "🎯",
      "color": "#0084FF",
      "children": ["node_1", "node_2"],
      "isRoot": true
    },
    {
      "id": "node_1",
      "title": "Subtopic",
      "content": "What this subtopic covers.",
      "icon": "📘",
      "color": "#4A90E2",
      "children": []
    }
  ]
}

RULES:
1. Flat array of nodes (not nested objects)
2. Each node has unique "id" (node_0, node_1, etc.)
3. "children" contains array of child node IDs (strings)
4. Exactly ONE node has "isRoot": true
5. Create 8-15 nodes covering main concepts
6. Titles: 2-5 words maximum
7. Content: 1-2 sentences, clear and educational
8. Use relevant emojis: 📚 📖 📝 🎯 💡 🔬 📊 🧮 🔍 ⚡ 🌟 🎓 🤖 📈 🧩
9. Use distinct hex colors: #0084FF #4A90E2 #50C878 #7ED321 #8B5CF6 #F59E0B #EF4444

OUTPUT: Valid JSON only (no markdown, no explanations)`;

    let rawText: string;

    if (hasOvercontent) {
        // ✅ Use OpenRouter with extracted text
        const prompt = `${systemPrompt}\n\nProcess the following content and generate a mindmap:\n\n${chapter.overcontent}`;

        const data = await callOpenRouterApi({
            model: "tngtech/deepseek-r1t2-chimera:free",
            messages: [
                { role: 'user', content: prompt }
            ],
            maxOutputTokens: 16384
        });

        rawText = extractOpenRouterText(data);

        if (!rawText) {
            console.error("OpenRouter Empty Response:", JSON.stringify(data, null, 2));
            return next(ErrorHandler.createError("No response content from OpenRouter API. Please check API response.", 500));
        }
    } else {
        // ✅ Fallback to OpenRouter for PDF content
        console.log('⚠️ overcontent is null, falling back to OpenRouter API for PDF');

        const prompt = `${systemPrompt}\n\nProcess the content in the PDF and generate a mindmap.`;

        const data = await callOpenRouterApi({
            model: "tngtech/deepseek-r1t2-chimera:free",
            messages: [
                { role: 'user', content: prompt }
            ],
            maxOutputTokens: 16384
        });

        rawText = extractOpenRouterText(data);

        if (!rawText) {
            console.error("OpenRouter Empty Response (PDF):", JSON.stringify(data, null, 2));
            return next(ErrorHandler.createError("No response content from OpenRouter API. Please check API response.", 500));
        }
    }

    // ✅ Parse JSON response (works for both OpenRouter and Gemini)
    let mindmapJson;
    try {
        // Remove markdown code blocks if present (Gemini typically wraps JSON in ```json ... ```)
        const cleanedText = rawText.replace(/```json\n?|\n?```/g, "").trim();
        mindmapJson = JSON.parse(cleanedText);
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
    const { _id, chapterId, title, nodes, newNodes } = req.body;
    const user = req.user;

    if (!_id) {
        return next(ErrorHandler.createError("Mindmap ID is required", 400));
    }

    // Find the mindmap
    const mindmap = await MindmapModel.findById(_id);
    if (!mindmap) {
        return next(ErrorHandler.createError("Mindmap not found", 404));
    }

    // Validate chapter ID matches
    if (chapterId && mindmap.chapterId.toString() !== chapterId) {
        return next(ErrorHandler.createError("Chapter ID mismatch the Mind Map", 400));
    }

    // Update mindmap title if provided
    if (title) {
        mindmap.title = title;
    }

    mindmap.updatedBy = user._id;

    // Process new nodes if provided
    if (newNodes && Array.isArray(newNodes) && newNodes.length > 0) {
        for (const newNode of newNodes) {
            if (!newNode.title) {
                return next(ErrorHandler.createError("Each new node must have a title", 400));
            }

            if (!newNode.parentId) {
                return next(ErrorHandler.createError("Each new node must have a parentId", 400));
            }

            // Validate parent node exists
            const parentNode = await NodeModel.findById(newNode.parentId);
            if (!parentNode) {
                return next(ErrorHandler.createError(`Parent node ${newNode.parentId} not found`, 404));
            }

            // Create new node
            const validatedNode: any = {
                title: newNode.title,
                icon: newNode.icon || "📘",
                color: newNode.color || "#3B82F6",
                content: newNode.content || "",
                children: [],
                isRoot: false
            };

            const createdNode = await NodeModel.create(validatedNode);

            // Add new node to mindmap's nodes array
            mindmap.nodes.push(createdNode._id);

            // Update parent node by modifying and saving

            const childObjectId = new mongoose.Types.ObjectId(createdNode._id as any);

            // Only append if not already there to avoid duplicates
            if (!parentNode.children.some(childId => childId.equals(childObjectId))) {
                parentNode.children.push(childObjectId);
                parentNode.markModified("children");
                const savedParent = await parentNode.save();
            }
        }
    }

    // Update existing nodes if provided
    if (nodes && Array.isArray(nodes) && nodes.length > 0) {
        for (const node of nodes) {
            if (!node._id) {
                continue; // Skip nodes without ID (they should be in newNodes)
            }

            if (!node.title) {
                return next(ErrorHandler.createError("Each node must have a title", 400));
            }

            const validatedNode: any = {
                title: node.title
            };

            if (node.icon !== undefined) {
                validatedNode.icon = node.icon;
            }

            if (node.color !== undefined) {
                validatedNode.color = node.color;
            }

            if (node.content !== undefined) {
                validatedNode.content = node.content;
            }

            if (node.isRoot !== undefined) {
                validatedNode.isRoot = node.isRoot;
            }

            await NodeModel.findByIdAndUpdate(node._id, validatedNode);
        }
    }

    // Save mindmap
    await mindmap.save();

    // Populate nodes before returning
    await mindmap.populate('nodes');

    return res.status(200).json({
        success: true,
        message: "Mindmap updated successfully",
        data: mindmap
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
    const systemPrompt = `You are an expert note-taker. Generate concise, smart notes on the user's topic.

OUTPUT FORMAT:
- First key point (1-2 sentences)
- Second key point (1-2 sentences)
- Third key point (1-2 sentences)
- Fourth key point (optional)
- Fifth key point (optional)

RULES:
1. Each point starts with "- " on a new line
2. 3-5 points maximum
3. 1-2 sentences per point
4. Be direct - no filler words
5. Paraphrase - don't copy text directly
6. Stay on topic - only relevant information
7. Academic tone - clear and professional
8. No introductions or conclusions - just the notes`;

    let generatedContent: string;

    if (hasOvercontent) {
        // ✅ Use OpenRouter with extracted text
        const prompt = `${systemPrompt}

User's topic: "${text}"

Chapter content to analyze:
${chapter.overcontent}

Generate smart notes about "${text}" based on the chapter content above.`;

        const data = await callOpenRouterApi({
            model: "tngtech/deepseek-r1t2-chimera:free",
            messages: [
                { role: 'user', content: prompt }
            ],
            maxOutputTokens: 1024
        });

        generatedContent = extractOpenRouterText(data);

        if (!generatedContent) {
            console.error("OpenRouter Empty Response (generatecontent):", JSON.stringify(data, null, 2));
            return next(ErrorHandler.createError("No response content from OpenRouter API. Please check API response.", 500));
        }
    } else {
        // ✅ Fallback to OpenRouter for PDF content
        console.log('⚠️ overcontent is null, falling back to OpenRouter API for PDF');

        const prompt = `${systemPrompt}

User's topic: "${text}"

Chapter content is in an attached PDF.

Generate smart notes about "${text}" based on the chapter content.`;

        const data = await callOpenRouterApi({
            model: "tngtech/deepseek-r1t2-chimera:free",
            messages: [
                { role: 'user', content: prompt }
            ],
            maxOutputTokens: 1024
        });

        generatedContent = extractOpenRouterText(data);

        if (!generatedContent) {
            console.error("OpenRouter Empty Response (generatecontent PDF):", JSON.stringify(data, null, 2));
            return next(ErrorHandler.createError("No response content from OpenRouter API. Please check API response.", 500));
        }
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

    // Track mindmap access in analysis
    try {
        await AnalysisService.updateLastMindmap(user._id.toString(), mindmapModel._id.toString());
    } catch (e) {
        console.error("Error tracking mindmap access:", e);
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
