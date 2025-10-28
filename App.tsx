
import React, { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ImageUploader } from './components/ImageUploader';
import { Button } from './components/Button';
import { Spinner } from './components/Spinner';
import { DownloadIcon, RetryIcon } from './components/icons';
import { generatePose } from './services/geminiService';
import { fileToBase64 } from './utils/fileUtils';

type ImageFile = {
  file: File;
  preview: string;
};

type StoredBaseImage = {
  data: string; // base64
  mimeType: string;
};

const App: React.FC = () => {
  const [baseImage, setBaseImage] = useLocalStorage<StoredBaseImage | null>('rex-base-image', null);
  const [poseImage, setPoseImage] = useState<ImageFile | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [poseSourceMode, setPoseSourceMode] = useState<'text' | 'image' | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleBaseImageUpload = (file: File) => {
    if (baseImage) {
      const isConfirmed = window.confirm("Replace permanent Rex reference? This will change the identity used for all future pose generations.");
      if (!isConfirmed) return;
    }
    
    fileToBase64(file).then(base64String => {
      setBaseImage({
        data: base64String,
        mimeType: file.type
      });
    }).catch(err => {
      console.error("Error converting file to base64", err);
      setError("Failed to process base character image.");
    });
  };

  const handleDeleteBaseImage = () => {
    if (window.confirm("Are you sure you want to delete the permanent Rex reference? This action cannot be undone.")) {
      setBaseImage(null);
      // Reset the entire app state
      setPoseImage(null);
      setPrompt('');
      setGeneratedImage(null);
      setError(null);
      setPoseSourceMode(null);
    }
  };

  const handlePoseImageUpload = (file: File) => {
    setPoseImage({
      file,
      preview: URL.createObjectURL(file)
    });
  };
  
  const handleGenerate = useCallback(async () => {
    if (!baseImage || !poseSourceMode) return;

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const poseImagePayload = (poseSourceMode === 'image' && poseImage) ? {
        data: await fileToBase64(poseImage.file),
        mimeType: poseImage.file.type
      } : null;

      const result = await generatePose(baseImage, {
          mode: poseSourceMode,
          poseImage: poseImagePayload,
          userPrompt: prompt
      });
      setGeneratedImage(`data:image/png;base64,${result}`);
    } catch (err) {
      console.error(err);
      const errorMessage = (err instanceof Error) ? err.message : "An unknown error occurred.";
      setError(`Failed to generate image. ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [baseImage, poseImage, prompt, poseSourceMode]);

  const handleTryNewPose = () => {
    setGeneratedImage(null);
    setPoseImage(null);
    setPrompt('');
    setError(null);
    setPoseSourceMode(null);
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = 'rex-new-pose.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  useEffect(() => {
    return () => {
      if (poseImage) {
        URL.revokeObjectURL(poseImage.preview);
      }
    };
  }, [poseImage]);

  const isGenerateDisabled = 
    isLoading || 
    !baseImage || 
    !poseSourceMode ||
    (poseSourceMode === 'image' && !poseImage) ||
    (poseSourceMode === 'text' && !prompt.trim());

  let validationMessage = '';
  if (baseImage && !poseSourceMode) {
    validationMessage = 'Choose whether to generate from Text or Pose Image.';
  } else if (poseSourceMode === 'image' && !poseImage) {
    validationMessage = 'Please upload a pose reference image to continue.';
  } else if (poseSourceMode === 'text' && !prompt.trim()) {
    validationMessage = 'Please describe the desired pose in the text prompt.';
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-800 tracking-tight">Rex Pose Creator</h1>
          <p className="mt-2 text-lg text-gray-600">Turn Your Character into Any Pose</p>
        </header>

        <main className="space-y-12">
          <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">1. Base Character</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <ImageUploader 
                onFileUpload={handleBaseImageUpload}
                label="Upload Base Character (Rex)" 
              />
              <div className="text-center md:text-left">
                {baseImage ? (
                  <>
                    <p className="text-green-600 font-medium mb-2">✓ Rex uploaded and locked as your base reference.</p>
                    <div className="flex justify-center md:justify-start items-center gap-4">
                        <img src={`data:${baseImage.mimeType};base64,${baseImage.data}`} alt="Base Character Preview" className="w-24 h-24 rounded-lg object-cover shadow-md" />
                        <div className="flex flex-col gap-2">
                             {/* FIX: The `size` prop was not defined on the Button component, and sizing was being handled by a redundant `className`. The Button component has been updated to accept a `size` prop, and the redundant `className` has been removed. */}
                             <Button onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()} variant="secondary" size="sm">Replace</Button>
                             <Button onClick={handleDeleteBaseImage} variant="danger" size="sm">Delete</Button>
                        </div>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500">Upload your character to get started. This will be saved as the permanent reference for all poses.</p>
                )}
              </div>
            </div>
          </section>

          {baseImage && (
            <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">2. Generate New Pose</h2>
              
              <fieldset className="mb-6">
                <legend className="block text-md font-medium text-gray-700 mb-2">Choose Pose Source</legend>
                <div className="flex gap-4">
                    <label className={`flex items-center p-3 border rounded-lg cursor-pointer flex-1 justify-center ${poseSourceMode === 'text' ? 'bg-indigo-50 border-indigo-500' : 'border-gray-300'}`}>
                        <input type="radio" name="pose-source" value="text" checked={poseSourceMode === 'text'} onChange={() => setPoseSourceMode('text')} className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                        <span className="ml-3 block text-sm font-medium text-gray-700">Use Text Prompt</span>
                    </label>
                    <label className={`flex items-center p-3 border rounded-lg cursor-pointer flex-1 justify-center ${poseSourceMode === 'image' ? 'bg-indigo-50 border-indigo-500' : 'border-gray-300'}`}>
                        <input type="radio" name="pose-source" value="image" checked={poseSourceMode === 'image'} onChange={() => setPoseSourceMode('image')} className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                        <span className="ml-3 block text-sm font-medium text-gray-700">Use Pose Image</span>
                    </label>
                </div>
              </fieldset>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <div className={`space-y-4 transition-opacity duration-300 ${poseSourceMode !== 'text' ? 'opacity-40' : 'opacity-100'}`}>
                  <label htmlFor="prompt" className="block text-md font-medium text-gray-700">Describe Rex’s New Pose {poseSourceMode === 'image' && '(Modifiers)'}</label>
                  <textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={poseSourceMode === 'image' ? "e.g., weak muscles, sweaty" : "e.g. Rex doing push-ups, side view"}
                    className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 ease-in-out"
                    disabled={poseSourceMode !== 'text' && poseSourceMode !== 'image'}
                  />
                </div>
                <div className={`space-y-4 transition-opacity duration-300 ${poseSourceMode !== 'image' ? 'opacity-40' : 'opacity-100'}`}>
                  <label className="block text-md font-medium text-gray-700">Upload a Pose Reference Image</label>
                  <ImageUploader onFileUpload={handlePoseImageUpload} label="Upload Pose Reference" existingPreview={poseImage?.preview} />
                </div>
              </div>
              <div className="mt-8 text-center">
                <Button onClick={handleGenerate} disabled={isGenerateDisabled} className="w-full sm:w-auto">
                  {isLoading ? <Spinner /> : 'Generate Pose'}
                </Button>
                {validationMessage && <p className="mt-4 text-sm text-yellow-700 bg-yellow-50 p-3 rounded-md">{validationMessage}</p>}
              </div>
            </section>
          )}

          {isLoading && (
            <div className="text-center p-6 bg-white rounded-2xl shadow-lg border border-gray-200">
                <div className="flex justify-center items-center mb-4"><Spinner /></div>
                <p className="text-lg text-indigo-600 animate-pulse">Generating your masterpiece... this can take a moment.</p>
            </div>
          )}
          {error && <p className="text-center text-red-600 bg-red-100 p-4 rounded-lg font-medium">{error}</p>}
          {generatedImage && (
            <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200 text-center">
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">3. Your New Pose</h2>
              <div className="flex justify-center mb-6">
                <img src={generatedImage} alt="Generated Pose" className="max-w-full h-auto max-h-96 rounded-lg shadow-2xl bg-white" />
              </div>
              <div className="flex justify-center gap-4">
                <Button onClick={handleDownload} variant="secondary"><DownloadIcon /> Download PNG</Button>
                <Button onClick={handleTryNewPose}><RetryIcon /> Try New Pose</Button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
