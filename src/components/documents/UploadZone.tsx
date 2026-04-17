"use client";

import { useDropzone } from "react-dropzone";
import { Upload } from "lucide-react";

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function UploadZone({ onFiles, disabled }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onFiles,
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
    },
    maxSize: 10 * 1024 * 1024,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
        isDragActive
          ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950"
          : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <input {...getInputProps()} />
      <Upload className="mb-3 h-10 w-10 text-zinc-400" />
      {isDragActive ? (
        <p className="text-sm font-medium text-emerald-600">Drop files here...</p>
      ) : (
        <>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Drag & drop documents here, or click to browse
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            PDF, PNG, JPG up to 10 MB each
          </p>
        </>
      )}
    </div>
  );
}
