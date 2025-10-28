
import React, { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useDebounce } from './hooks/useDebounce';
import { ImageUploader } from './components/ImageUploader';
import { Button } from './components/Button';
import { Spinner } from './components/Spinner';
import { DownloadIcon, RetryIcon } from './components/icons';
import { generatePose, generatePoseDescription } from './services/geminiService';
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
  
  const [poseDescription, setPoseDescription] = useState<string>('');
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [showDescriptionEditor, setShowDescriptionEditor] = useState<boolean>(false);

  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedPrompt = useDebounce(prompt, 500);
  const debouncedPoseImage = useDebounce(poseImage, 500);

  // Effect to generate pose description preview
  useEffect(() => {
    if (!poseSourceMode) return;

    const getPoseDescription = async () => {
      if (poseSourceMode === 'text' && debouncedPrompt.trim()) {
        setIsPreviewLoading(true);
        setError(null);
        try {
          const description = await generatePoseDescription(null, debouncedPrompt);
          setPoseDescription(description);
          setShowDescriptionEditor(true);
        } catch (err) {
          const message = err instanceof Error ? err.message : "An unknown error occurred.";
          setError(`Could not generate pose description: ${message}`);
          setShowDescriptionEditor(false);
        } finally {
          setIsPreviewLoading(false);
        }
      } else if (poseSourceMode === 'image' && debouncedPoseImage) {
        setIsPreviewLoading(true);
        setError(null);
        try {
          const imagePayload = {
            data: await fileToBase64(debouncedPoseImage.file),
            mimeType: debouncedPoseImage.file.type
          };
          const description = await generatePoseDescription(imagePayload, null);
          setPoseDescription(description);
          setShowDescriptionEditor(true);
        } catch (err) {
          const message = err instanceof Error ? err.message : "An unknown error occurred.";
          setError(`Could not generate pose description from image: ${message}`);
          setShowDescriptionEditor(false);
        } finally {
          setIsPreviewLoading(false);
        }
      } else {
        setShowDescriptionEditor(false);
        setPoseDescription('');
      }
    };
    
    getPoseDescription();
  }, [debouncedPrompt, debouncedPoseImage, poseSourceMode]);

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
      setPoseImage(null);
      setPrompt('');
      setGeneratedImage(null);
      setError(null);
      setPoseSourceMode(null);
      setShowDescriptionEditor(false);
    }
  };

  const handlePoseImageUpload = (file: File) => {
    setPoseImage({
      file,
      preview: URL.createObjectURL(file)
    });
    setPrompt('');
  };
  
  const handleGenerate = useCallback(async () => {
    if (!baseImage || !poseDescription) return;

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);
    
    console.log({
      event: 'generation_start',
      timestamp: new Date().toISOString(),
      mode: poseSourceMode,
      prompt: poseDescription,
    });

    let success = false;
    for (let i = 0; i < 3 && !success; i++) {
        if (i > 0) console.log(`Attempt ${i + 1} to generate pose...`);
        try {
            const poseImagePayload = (poseSourceMode === 'image' && poseImage) ? {
                data: await fileToBase64(poseImage.file),
                mimeType: poseImage.file.type
            } : null;

            const result = await generatePose(baseImage, {
                mode: poseSourceMode as 'text' | 'image',
                poseImage: poseImagePayload,
                poseDescription: poseDescription
            });
            setGeneratedImage(`data:image/png;base64,${result}`);
            success = true;
        } catch (err) {
            console.error(err);
            const errorMessage = (err instanceof Error) ? err.message : "An unknown error occurred.";
            
            if (errorMessage.includes("Requested entity was not found.")) {
                setError("Your API key seems to be invalid. Please double-check the key in services/geminiService.ts.");
                break;
            } else if (errorMessage.includes("POSE_DETECTION_FAILED")) {
                setError("Pose not detected clearly — try a clearer or single-person image.");
                break;
            } else if (errorMessage.includes("MULTIPLE_PEOPLE_DETECTED")) {
                setError("Multiple people detected — please crop to one person for best accuracy.");
                break;
            }
            
            setError(`Failed to generate image (attempt ${i+1}). ${errorMessage}`);
        }
    }

    setIsLoading(false);

  }, [baseImage, poseImage, poseDescription, poseSourceMode]);

  const handleTryNewPose = () => {
    setGeneratedImage(null);
    setPoseImage(null);
    setPrompt('');
    setError(null);
    setPoseSourceMode(null);
    setShowDescriptionEditor(false);
    setPoseDescription('');
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
    const previewUrl = poseImage?.preview;
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [poseImage]);

  const isGenerateDisabled = isLoading || !poseDescription;

  const handlePoseSourceChange = (mode: 'text' | 'image') => {
    setPoseSourceMode(mode);
    setError(null);
    setPoseImage(null);
    setPrompt('');
    setShowDescriptionEditor(false);
    setPoseDescription('');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-800 tracking-tight">Rex Pose Creator</h1>
          <p className="mt-2 text-lg text-gray-600">Turn Your Character into Any Pose</p>
        </header>

        <main className="space-y-12">
          {/* Step 1: Base Character */}
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

          {/* Step 2: Provide Pose Source */}
          {baseImage && (
            <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">2. Provide Pose Source</h2>
              
              <fieldset className="mb-6">
                <div className="flex gap-4">
                    <label className={`flex items-center p-3 border rounded-lg cursor-pointer flex-1 justify-center ${poseSourceMode === 'text' ? 'bg-indigo-50 border-indigo-500' : 'border-gray-300'}`}>
                        <input type="radio" name="pose-source" value="text" checked={poseSourceMode === 'text'} onChange={() => handlePoseSourceChange('text')} className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                        <span className="ml-3 block text-sm font-medium text-gray-700">Use Text Prompt</span>
                    </label>
                    <label className={`flex items-center p-3 border rounded-lg cursor-pointer flex-1 justify-center ${poseSourceMode === 'image' ? 'bg-indigo-50 border-indigo-500' : 'border-gray-300'}`}>
                        <input type="radio" name="pose-source" value="image" checked={poseSourceMode === 'image'} onChange={() => handlePoseSourceChange('image')} className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                        <span className="ml-3 block text-sm font-medium text-gray-700">Use Pose Image</span>
                    </label>
                </div>
              </fieldset>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                 <div className={`space-y-4 transition-opacity duration-300 ${poseSourceMode !== 'text' ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                   <label htmlFor="prompt" className="block text-md font-medium text-gray-700">Describe Rex’s New Pose</label>
                   <textarea
                     id="prompt"
                     value={prompt}
                     onChange={(e) => setPrompt(e.target.value)}
                     placeholder={"e.g. Rex doing push-ups, side view"}
                     className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 ease-in-out"
                     disabled={poseSourceMode !== 'text'}
                   />
                 </div>
                 <div className={`space-y-4 transition-opacity duration-300 ${poseSourceMode !== 'image' ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                   <label className="block text-md font-medium text-gray-700">Upload a Pose Reference Image</label>
                   <ImageUploader onFileUpload={handlePoseImageUpload} label="Upload Pose Reference" existingPreview={poseImage?.preview} />
                 </div>
              </div>
            </section>
          )}
          
          {/* Step 3: Confirm Pose & Generate */}
          {baseImage && poseSourceMode && (
             <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
                <h2 className="text-2xl font-semibold text-gray-700 mb-4">3. Confirm Pose & Generate</h2>
                 {isPreviewLoading && <p className="text-center text-gray-600 animate-pulse">Processing pose...</p>}

                {showDescriptionEditor && !isPreviewLoading && (
                    <div className="space-y-4">
                        <label htmlFor="poseDescription" className="block text-md font-medium text-gray-700">Pose Description Preview</label>
                        <p className="text-sm text-gray-500">The AI interpreted your input as the following pose. You can edit this text to refine the result before generating.</p>
                        <textarea
                            id="poseDescription"
                            value={poseDescription}
                            onChange={(e) => setPoseDescription(e.target.value)}
                            className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <div className="text-center">
                             <Button onClick={handleGenerate} disabled={isGenerateDisabled} className="w-full sm:w-auto">
                               {isLoading ? <Spinner /> : 'Confirm & Generate Pose'}
                             </Button>
                        </div>
                    </div>
                )}
             </section>
          )}

          {isLoading && (
            <div className="text-center p-6 bg-white rounded-2xl shadow-lg border border-gray-200">
                <div className="flex justify-center items-center mb-4"><Spinner /></div>
                <p className="text-lg text-indigo-600 animate-pulse">Generating your masterpiece... this can take a moment.</p>
            </div>
          )}

          {error && <p className="text-center text-red-600 bg-red-100 p-4 rounded-lg font-medium">{error}</p>}
          
          {/* Step 4: Your New Pose */}
          {generatedImage && !isLoading && (
            <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200 text-center">
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">4. Your New Pose</h2>
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
