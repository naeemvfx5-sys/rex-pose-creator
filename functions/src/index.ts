
import * as functions from "firebase-functions";
import { GoogleGenAI, Modality, Part } from "@google/genai";
import * as cors from "cors";
// FIX: Import Request and Response from express to resolve type conflicts
// with global DOM types that were causing compilation errors.
import { Request, Response } from "express";

// Initialize CORS middleware
const corsHandler = cors({ origin: true });

// Get the API key from Vercel's environment variables.
// This is the standard and secure way to store secrets on Vercel.
const API_KEY = process.env.GEMINI_KEY;
if (!API_KEY) {
  throw new Error("Gemini API Key not found in environment variables.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

// Define types to match the payload sent from the frontend.
type ImagePayload = {
  data: string;
  mimeType: string;
};

type GenerateOptions = {
  mode: "text" | "image";
  poseImage: ImagePayload | null;
  userPrompt: string;
};

// FIX: Added explicit types for `req` and `res` to resolve TypeScript errors
// caused by incorrect type inference, which was likely conflicting with global
// DOM types.
export const generatePose = functions.https.onRequest((req: Request, res: Response) => {
  // Handle CORS for the request.
  corsHandler(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    try {
      const { baseImage, options } = req.body as {
        baseImage: ImagePayload;
        options: GenerateOptions;
      };

      if (!baseImage || !options) {
        res.status(400).json({ error: "Missing baseImage or options in request body." });
        return;
      }

      // This is the exact same generation logic from the old frontend service,
      // now running securely on the backend.
      const { mode, poseImage, userPrompt } = options;
      let instructionPrompt: string;
      const parts: Part[] = [
        { inlineData: { mimeType: baseImage.mimeType, data: baseImage.data } },
      ];

      if (mode === "image") {
        if (!poseImage) {
          throw new Error("A pose image is required when using image mode.");
        }
        instructionPrompt = `
            You are a precision pose-transfer AI. Your task is to extract a pose from a reference image and apply it to a base character with 100% accuracy, then apply minor modifiers.
            **Critical Rules:**
            1. **Identity Lock:** The FIRST image is the **Base Character (Rex)**. Its face, outfit, art style, colors, and proportions are SACRED. You must preserve them perfectly.
            2. **Pose Source:** The SECOND image is the **Pose Reference**. Use it ONLY to extract a pose skeleton (like ControlNet/OpenPose keypoints). IGNORE its style, colors, clothing, and character.
            3. **100% Pose Replication:** Replicate the pose from the Pose Reference with absolute precision. If the pose is awkward, unbalanced, or biomechanically incorrect, you MUST copy that exact incorrect pose. DO NOT "correct" or "improve" the form. Map the joint positions and limb angles precisely to the Base Character's proportions.
            4. **Modifiers:** The user prompt provides optional modifiers (e.g., 'weak muscles', 'sweaty'). Apply these ONLY AFTER the pose has been perfectly replicated. Do not let modifiers change the pose itself.
            5. **Background:** The output MUST be a high-quality PNG of the character on a minimal, flat white background. No gradients, scenes, or props.
            6. **Error Handling:**
                - If the Pose Reference image does not contain a clear human figure to extract a pose from, you MUST fail and respond with the exact error text: "Pose detection failed".
                - If the Pose Reference contains multiple people, focus on the most prominent, centered figure. Do not merge poses.
            **User Prompt for Modifiers:** "${userPrompt}"
        `;
        parts.push({ inlineData: { mimeType: poseImage.mimeType, data: poseImage.data } });
        parts.push({ text: instructionPrompt });
      } else { // mode === 'text'
        instructionPrompt = `
            You are an expert character artist. Your task is to generate a new image of a character based on a text description of a pose.
            **Critical Rules:**
            1. **Identity Lock:** The provided image is the **Base Character (Rex)**. This is the ONLY reference for the character's identity, face, art style, proportions, outfit, and colors. You MUST preserve these features perfectly.
            2. **Pose Source:** The User Prompt is the ONLY source of information for the new pose. IGNORE any other images that might have been accidentally provided.
            3. **Execution:** Recreate the character from the Base Character Image in the new pose described by the user prompt.
            4. **Background:** The output MUST be a high-quality PNG of the character on a minimal, flat white background. No gradients, scenes, or props.
            **User Prompt for Pose:** "${userPrompt}"
        `;
        parts.push({ text: instructionPrompt });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts },
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });

      const firstPart = response.candidates?.[0]?.content?.parts?.[0];
      if (firstPart?.text?.includes("Pose detection failed")) {
          throw new Error("Pose detection failed — please upload a clearer pose reference image.");
      }

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          // Send the successful result back to the frontend.
          res.status(200).json({ imageData: part.inlineData.data });
          return;
        }
      }

      throw new Error("No image was generated by the API.");
    } catch (error) {
      console.error("Error in generatePose function:", error);
      const message = error instanceof Error ? error.message : "An internal server error occurred.";
      res.status(500).json({ error: message });
    }
  });
});
