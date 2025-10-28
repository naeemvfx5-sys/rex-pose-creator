import { GoogleGenAI, Modality, Part } from "@google/genai";

type ImagePayload = {
    data: string; // base64
    mimeType: string;
};

type GenerateOptions = {
    mode: 'text' | 'image';
    poseImage: ImagePayload | null;
    poseDescription: string;
}

const getAiClient = () => {
    // IMPORTANT: Since this app runs directly in the browser without a build step,
    // we must hardcode the API key here.
    const API_KEY = "AIzaSyB4nFStA1VbchE8fLXLf10F-t2bWY9t9Dg";

    if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
        throw new Error("API key not configured. Please add your Gemini API key to services/geminiService.ts");
    }
    
    return new GoogleGenAI({ apiKey: API_KEY });
}

export const generatePoseDescription = async (
    image: ImagePayload | null,
    text: string | null
): Promise<string> => {
    const ai = getAiClient();
    const parts: Part[] = [];
    let promptText: string;

    if (image) {
        promptText = "Analyze the provided image and describe the person's pose in a concise, neutral sentence. Focus only on the body's position, not the character or style. Example: 'A person standing with arms crossed.'";
        parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
        parts.push({ text: promptText });
    } else if (text) {
        // This seems redundant, but it helps normalize user input into a consistent descriptive format for the next step.
        promptText = `Based on the following user input, describe the character's pose in a concise, neutral sentence. Example: 'A character is doing push-ups, seen from the side.'\n\nUser Input: "${text}"`;
        parts.push({ text: promptText });
    } else {
        throw new Error("Either an image or text must be provided for description.");
    }
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts }
    });

    return (response.text ?? '').trim();
};


export const generatePose = async (
    baseImage: ImagePayload,
    options: GenerateOptions
): Promise<string> => {
    const ai = getAiClient();
    const { mode, poseImage, poseDescription } = options;
    let instructionPrompt: string;
    const parts: Part[] = [
        { inlineData: { mimeType: baseImage.mimeType, data: baseImage.data } },
    ];

    if (mode === 'image') {
        if (!poseImage) {
            throw new Error("A pose image is required when using image mode.");
        }
        instructionPrompt = 'You are a precision pose-transfer AI. Your task is to extract a pose from a reference image, apply it to a base character, and then apply modifiers from a text description.\n\n' +
            '**Critical Rules:**\n' +
            '1.  **Identity & Style Lock:** The FIRST image is the **Base Character (Rex)**. Its face, outfit, art style, colors, proportions, line thickness, and lighting are SACRED. You must preserve them with 100% fidelity. If the output face does not match the base character\'s face with at least 90% similarity, it is a failure.\n' +
            '2.  **Pose Source:** The SECOND image is the **Pose Reference**. Use it ONLY to extract a pose skeleton (like ControlNet/OpenPose keypoints). IGNORE its style, colors, clothing, and character identity.\n' +
            '3.  **100% Pose Replication:** Replicate the pose from the Pose Reference with absolute, robotic precision. If the pose is awkward, unbalanced, or biomechanically incorrect, you MUST copy that exact incorrect pose. DO NOT "correct" or "improve" it. Match joint positions and limb angles perfectly to the Base Character\'s proportions. A deviation of more than 5% is a failure.\n' +
            '4.  **Pose Description & Modifiers:** The final text input is the **Pose Description**. This confirms the intended pose and provides modifiers. Use this to refine the final output AFTER the pose has been perfectly replicated.\n' +
            '5.  **Background:** The output MUST be a high-quality PNG of the character on a pure white background (#FFFFFF). No shadows, gradients, scenes, or transparency.\n' +
            '6.  **Error Handling (IMPORTANT):**\n' +
            '    - If the Pose Reference image does not contain a clear human-like figure to extract a pose from, you MUST fail and respond with ONLY the exact text: "POSE_DETECTION_FAILED".\n' +
            '    - If the Pose Reference contains multiple people, you MUST fail and respond with ONLY the exact text: "MULTIPLE_PEOPLE_DETECTED".\n' +
            '    - Do not generate an image if these error conditions are met. Only return the error text.\n\n' +
            '**Pose Description & Modifiers:** "' + poseDescription + '"';
        parts.push({ inlineData: { mimeType: poseImage.mimeType, data: poseImage.data } });
        parts.push({ text: instructionPrompt });
    } else { // mode === 'text'
        instructionPrompt = 'You are an expert character artist. Your task is to generate a new image of a character based on a text description of a pose.\n\n' +
            '**Critical Rules:**\n' +
            '1.  **Identity & Style Lock:** The provided image is the **Base Character (Rex)**. This is the ONLY reference for the character\'s identity, face, art style, proportions, outfit, colors, line thickness, and lighting. You MUST preserve these features with 100% fidelity.\n' +
            '2.  **Pose Source:** The User\'s Pose Description is the ONLY source of information for the new pose.\n' +
            '3.  **Execution:** Recreate the character from the Base Character Image in the new pose described by the user\'s pose description.\n' +
            '4.  **Background:** The output MUST be a high-quality PNG of the character on a pure white background (#FFFFFF). No gradients, scenes, or props.\n\n' +
            '**User\'s Pose Description:** "' + poseDescription + '"';
        parts.push({ text: instructionPrompt });
    }
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
    
    // Check for text-based error responses first
    const responseText = (response.text ?? '').trim();
    if (responseText) {
        if (responseText.includes("POSE_DETECTION_FAILED")) {
            throw new Error("POSE_DETECTION_FAILED: The model could not detect a clear pose in the reference image.");
        }
        if (responseText.includes("MULTIPLE_PEOPLE_DETECTED")) {
            throw new Error("MULTIPLE_PEOPLE_DETECTED: The model detected multiple people in the reference image.");
        }
    }

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData) {
            return part.inlineData.data;
        }
    }

    throw new Error("No image was generated by the API. The model may have refused the request.");
};