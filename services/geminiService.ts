// These types are now just for defining the structure of the data we send to our backend.
type ImagePayload = {
    data: string; // base64
    mimeType: string;
};

type GenerateOptions = {
    mode: 'text' | 'image';
    poseImage: ImagePayload | null;
    userPrompt: string;
}

/**
 * Sends a request to our secure backend Firebase Function to generate a pose.
 * The backend will handle the Gemini API call securely.
 * @param baseImage The base character image.
 * @param options The generation options (mode, pose image, prompt).
 * @returns A promise that resolves to the base64 string of the generated image.
 */
export const generatePose = async (
    baseImage: ImagePayload,
    options: GenerateOptions
): Promise<string> => {
    
    // The URL for our Firebase Function. We use a relative path, and Firebase Hosting
    // will automatically rewrite this request to our backend function.
    const functionUrl = '/generatePose';

    try {
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Send all the necessary data in the request body.
            body: JSON.stringify({ baseImage, options }),
        });

        const result = await response.json();

        if (!response.ok) {
            // If the backend returned an error, we'll throw it so the UI can display it.
            throw new Error(result.error || `Request failed with status ${response.status}`);
        }

        // The backend returns the image data in a property called 'imageData'.
        return result.imageData;

    } catch (error) {
        console.error("Error calling backend function:", error);
        // Re-throw the error so the UI can catch it and display a message to the user.
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while communicating with the generation service.");
    }
};
