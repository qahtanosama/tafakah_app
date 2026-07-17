"use client";

import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload } from "lucide-react";
import { MAX_CERT_SIZE_BYTES } from "@/lib/contracts/cert-storage";

interface Props {
  onFiles: (files: File[]) => void;
  /** Called with a human-readable message when files are refused (too large / wrong type). */
  onRejected?: (message: string) => void;
  disabled?: boolean;
}

function rejectionMessage(rejections: FileRejection[]): string {
  const parts = rejections.map(({ file, errors }) => {
    const code = errors[0]?.code;
    const reason =
      code === "file-too-large" ? "over 50 MB"
      : code === "file-invalid-type" ? "unsupported type"
      : errors[0]?.message ?? "rejected";
    return `${file.name} (${reason})`;
  });
  return `Not uploaded: ${parts.join(", ")}`;
}

export default function UploadZone({ onFiles, onRejected, disabled }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onFiles,
    onDropRejected: (rejections) => onRejected?.(rejectionMessage(rejections)),
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
      "image/heic": [".heic"],
      "image/heif": [".heif"],
    },
    maxSize: MAX_CERT_SIZE_BYTES,
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
            PDF or image (PNG, JPG, WEBP, HEIC) up to 50 MB each
          </p>
        </>
      )}
    </div>
  );
}
