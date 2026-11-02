"use client";

import { useState } from "react";
import type { DragEvent } from "react";
import { FileSpreadsheet } from "lucide-react";
import { MAX_WORKBOOK_BYTES } from "@/lib/workbookImport/types";

interface Props {
  fileName: string | null;
  disabled: boolean;
  onFile: (file: File | undefined) => void;
}

/** Drag-and-drop or click-to-choose for one .xlsx file. The native file input stays keyboard-operable underneath. */
export const WorkbookDropZone = ({ fileName, disabled, onFile }: Props) => {
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) onFile(event.dataTransfer.files?.[0]);
  };

  return (
    <label
      htmlFor="workbook-file"
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center text-sm focus-within:ring-2 focus-within:ring-[#0B3B32] ${
        dragging ? "border-[#0B3B32] bg-emerald-50" : "border-gray-300 bg-gray-50 hover:bg-gray-100"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <FileSpreadsheet className="h-8 w-8 text-[#0B3B32]" aria-hidden="true" />
      <span className="font-medium text-gray-800">{fileName ?? "Drop the Excel file here, or click to choose it"}</span>
      <span className="text-[13px] text-gray-500">.xlsx only, up to {MAX_WORKBOOK_BYTES / 1_000_000} MB</span>
      <input
        id="workbook-file"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          // Lets the same file be chosen again after fixing it.
          event.target.value = "";
        }}
      />
    </label>
  );
};
