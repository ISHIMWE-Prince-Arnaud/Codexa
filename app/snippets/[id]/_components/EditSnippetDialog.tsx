"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { SUPPORTED_LANGUAGES } from "@/convex/constants";

interface EditSnippetDialogProps {
  snippetId: Id<"snippets">;
  currentTitle: string;
  currentLanguage: string;
  currentCode: string;
  onClose: () => void;
  onSuccess: () => void;
}

function EditSnippetDialog({
  snippetId,
  currentTitle,
  currentLanguage,
  currentCode,
  onClose,
  onSuccess,
}: EditSnippetDialogProps) {
  const [title, setTitle] = useState(currentTitle);
  const [language, setLanguage] = useState(currentLanguage);
  const [code, setCode] = useState(currentCode);
  const [isUpdating, setIsUpdating] = useState(false);

  const updateSnippet = useMutation(api.snippets.updateSnippet);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    if (!code.trim()) {
      toast.error("Code is required");
      return;
    }

    setIsUpdating(true);

    try {
      await updateSnippet({
        snippetId,
        title: title.trim(),
        language: language as (typeof SUPPORTED_LANGUAGES)[number],
        code: code.trim(),
      });
      toast.success("Snippet updated successfully");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error updating snippet:", error);
      toast.error("Error updating snippet");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e1e2e] rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Edit Snippet</h2>
          <button
            onClick={onClose}
            disabled={isUpdating}
            className="text-gray-400 hover:text-gray-300 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-400 mb-2"
            >
              Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter snippet title"
              required
              disabled={isUpdating}
            />
            <p className="text-xs text-gray-500 mt-1">
              {title.length}/200 characters
            </p>
          </div>

          <div>
            <label
              htmlFor="language"
              className="block text-sm font-medium text-gray-400 mb-2"
            >
              Language
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={isUpdating}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang.charAt(0).toUpperCase() + lang.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="code"
              className="block text-sm font-medium text-gray-400 mb-2"
            >
              Code
            </label>
            <textarea
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={50000}
              rows={15}
              className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Enter your code here..."
              required
              disabled={isUpdating}
            />
            <p className="text-xs text-gray-500 mt-1">
              {code.length.toLocaleString()}/50,000 characters
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isUpdating}
              className="px-4 py-2 text-gray-400 hover:text-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUpdating ? "Updating..." : "Update Snippet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditSnippetDialog;
