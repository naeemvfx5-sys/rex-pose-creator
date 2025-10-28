
import React, { useCallback } from 'react';
import { UploadIcon } from './icons';

interface ImageUploaderProps {
  onFileUpload: (file: File) => void;
  label: string;
  existingPreview?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onFileUpload, label, existingPreview }) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  }, [onFileUpload]);

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <label
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="w-full h-48 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition duration-300 ease-in-out"
    >
      {existingPreview ? (
        <img src={existingPreview} alt="Preview" className="w-full h-full object-contain rounded-lg p-1" />
      ) : (
        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
          <UploadIcon />
          <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      )}
      <input type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
    </label>
  );
};
