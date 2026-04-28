import { CodeEditorState } from "./../types/index";
import { create } from "zustand";
import { Monaco } from "@monaco-editor/react";

const getInitialState = () => {
  // if we're on the server, return default values
  if (typeof window === "undefined") {
    return {
      language: "javascript",
      fontSize: 16,
      theme: "vs-dark",
    };
  }

  try {
    // if we're on the client, return values from local storage bc localStorage is a browser API.
    const savedLanguage = localStorage.getItem("editor-language") || "javascript";
    const savedTheme = localStorage.getItem("editor-theme") || "vs-dark";
    const savedFontSize = localStorage.getItem("editor-font-size") || 16;

    return {
      language: savedLanguage,
      theme: savedTheme,
      fontSize: Number(savedFontSize),
    };
  } catch {
    return {
      language: "javascript",
      fontSize: 16,
      theme: "vs-dark",
    };
  }
};

export const useCodeEditorStore = create<CodeEditorState>((set, get) => {
  const initialState = getInitialState();

  return {
    ...initialState,
    output: "",
    isRunning: false,
    error: null,
    editor: null,
    executionResult: null,

    getCode: () => get().editor?.getValue() || "",

    setEditor: (editor: Monaco) => {
      try {
        const savedCode = localStorage.getItem(`editor-code-${get().language}`);
        if (savedCode) editor.setValue(savedCode);
      } catch {
        // Ignore localStorage errors (e.g., in restricted storage contexts)
      }

      set({ editor });
    },

    setTheme: (theme: string) => {
      localStorage.setItem("editor-theme", theme);
      set({ theme });
    },

    setFontSize: (fontSize: number) => {
      localStorage.setItem("editor-font-size", fontSize.toString());
      set({ fontSize });
    },

    setLanguage: (language: string) => {
      // Save current language code before switching
      const currentCode = get().editor?.getValue();
      if (currentCode) {
        localStorage.setItem(`editor-code-${get().language}`, currentCode);
      }

      localStorage.setItem("editor-language", language);

      set({
        language,
        output: "",
        error: null,
      });
    },

    runCode: async (executeFn?: (args: { language: string; code: string }) => Promise<{ success: boolean; output: string; error: string | null }>) => {
      const { language, getCode } = get();
      const code = getCode();

      if (!code) {
        set({ error: "Please enter some code" });
        return;
      }

      set({ isRunning: true, error: null, output: "" });

      try {
        if (!executeFn) {
          throw new Error("Execution function not provided");
        }

        const result = await executeFn({ language, code });

        if (!result.success) {
          set({
            error: result.error,
            executionResult: { code, output: "", error: result.error },
          });
          return;
        }

        set({
          output: result.output,
          error: null,
          executionResult: {
            code,
            output: result.output,
            error: null,
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Error running code";
        set({
          error: errorMessage,
          executionResult: { code, output: "", error: errorMessage },
        });
      } finally {
        set({ isRunning: false });
      }
    },
  };
});

export const getExecutionResult = () =>
  useCodeEditorStore.getState().executionResult;
