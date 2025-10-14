import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import MindmapModel from "../models/MindmapModel";
import NodeModel from "../models/NodeModel";
import ErrorHandler from "../utils/error";
import { getMimeType, retryGeminiApiCall } from "../utils/geminiApi";

const createMindmap = asyncWrapper(async (req, res, next) => {
    let { chapterId,regenerate }:{chapterId:string,regenerate:boolean} = req.body;
    const user = req.user;
    if(!regenerate){
        regenerate=false;
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

    // ✅ Generate new mindmap
    const chapterContent = chapter.overcontent || chapter.content?.toString("utf-8") || "";

    if (!chapterContent) {
        return next(ErrorHandler.createError("Chapter content missing", 400));
    }

    const base64File = chapter.content?.toString("base64") || "";
    const mimeType = getMimeType("chapter.pdf", chapter.contentType);

    // Prepare Gemini parts
    const parts = [
        {
            text: `You are an expert knowledge extraction AI that **converts educational content into a structured flat mindmap JSON**.

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
- Never output markdown, code fences, or explanations — only the JSON object

Now process the following content:
${chapter.overcontent || ""}`,
        },
        ...(chapter.overcontent ? [] : [
            { inlineData: { mimeType, data: base64File } }
        ]),
    ];

    // ✅ Call Gemini API with proper request format
    const response = await retryGeminiApiCall({
        contents: [
            {
                role: "user",
                parts: parts
            }
        ],
        generationConfig: {
            temperature: 0.2,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 8192
        }
    });

    // ✅ Extract and validate response
    if (!response) {
        return next(ErrorHandler.createError("No response from Gemini API", 500));
    }

    // Parse the JSON response body
    let responseData;
    try {
        responseData = await response.json();
    } catch (error) {
        console.error("❌ Failed to parse response JSON:", error);
        return next(ErrorHandler.createError("Invalid JSON response from Gemini API", 500));
    }

    if (!responseData.candidates || !Array.isArray(responseData.candidates)) {
        return next(ErrorHandler.createError("Invalid response format from Gemini API", 500));
    }

    if (responseData.candidates.length === 0) {
        return next(ErrorHandler.createError("No content generated by Gemini API", 500));
    }

    const candidate = responseData.candidates[0];

    if (candidate.finishReason === 'SAFETY') {
        return next(ErrorHandler.createError("Content was blocked for safety reasons", 400));
    }

    if (!candidate.content?.parts?.[0]?.text) {
        return next(ErrorHandler.createError("No text content in Gemini response", 500));
    }

    const rawText = candidate.content.parts[0].text.trim();

    // Clean up markdown code fences if present
    let cleanText = rawText;
    if (rawText.startsWith('```json')) {
        cleanText = rawText.replace(/```json\s*/, '').replace(/```\s*$/, '');
    } else if (rawText.startsWith('```')) {
        cleanText = rawText.replace(/```\s*/, '').replace(/```\s*$/, '');
    }

    // ✅ Parse JSON response
    let mindmapJson;
    try {
        // Try direct parse first with cleaned text
        mindmapJson = JSON.parse(cleanText);
    } catch (error) {
        console.error("❌ Direct JSON parse failed, trying repair...");
        try {
            // Try to repair JSON if parsing fails
            const { jsonrepair } = require("jsonrepair");
            mindmapJson = JSON.parse(jsonrepair(cleanText));
        } catch (repairError) {
            console.error("❌ Failed to parse Gemini response after repair:", cleanText);
            return next(
                ErrorHandler.createError(
                    "Failed to process the mindmap. Please try again.",
                    500
                )
            );
        }
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

    return res.status(200).json({
        success: true,
        message: "Mindmap created successfully",
        data: mindmapModel,
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

    const chapterContent = chapter.overcontent || chapter.content?.toString("utf-8") || "";
    if (!chapterContent) {
        return next(ErrorHandler.createError("Chapter content missing", 400));
    }

    const base64File = chapter.content?.toString("base64") || "";
    const mimeType = getMimeType("chapter.pdf", chapter.contentType);

    // Prepare enhanced Gemini prompt
    const parts = [
        {
            text: `You are an expert educational content generator that creates concise, structured notes based on user input and chapter content.

Task:
- Analyze the user's text input: "${text}"
- Extract the main ideas from the provided chapter content
- Generate brief, well-structured smart notes

Format Requirements:
- Start EACH point with a dash and space: "- "
- Format: "- First point content -Second point content - Third point content"
- All points should be on separate lines
- Example format:
  - First main idea here (1-2 sentences)
  - Second main idea here (1-2 sentences)
  - Third main idea here (1-2 sentences)

Guidelines:
- Keep ALL content brief and academic (1-2 sentences per point maximum)
- Focus only on "${text}" - stay relevant and concise
- Maintain academic tone with clear, direct language
- Provide 3-5 main points ONLY
- Each point should be 1-2 sentences maximum
- Be extremely concise - no lengthy explanations
- Return ONLY the generated notes (no meta-commentary or introductions)

Chapter content to analyze:
${chapter.overcontent || ""}`,
        },
        ...(chapter.overcontent ? [] : [
            { inlineData: { mimeType, data: base64File } }
        ]),
    ];

    // Call Gemini API
    const response = await retryGeminiApiCall({
        contents: [
            {
                role: "user",
                parts: parts
            }
        ],
        generationConfig: {
            temperature: 0.4,
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 8192
        }
    });

    // Validate response
    if (!response) {
        return next(ErrorHandler.createError("No response from Gemini API", 500));
    }

    // Parse response data
    let responseData;
    try {
        responseData = await response.json();
    } catch (error) {
        console.error("❌ Failed to parse Gemini response:", error);
        return next(ErrorHandler.createError("Invalid response from Gemini API", 500));
    }

    // Validate response structure
    if (!responseData.candidates || !Array.isArray(responseData.candidates) || responseData.candidates.length === 0) {
        return next(ErrorHandler.createError("No content generated by Gemini API", 500));
    }

    const candidate = responseData.candidates[0];

    // Check for safety blocks
    if (candidate.finishReason === 'SAFETY') {
        return next(ErrorHandler.createError("Content was blocked for safety reasons", 400));
    }

    // Extract generated content
    if (!candidate.content?.parts?.[0]?.text) {
        return next(ErrorHandler.createError("No text content in Gemini response", 500));
    }

    const generatedContent = candidate.content.parts[0].text.trim();

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
const MindmapController = {
    createMindmap, saveMindmap, generatecontent
};

export default MindmapController;
