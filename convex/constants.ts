// Shared constants between frontend and backend
// This file is imported by both convex actions and frontend code

export const PISTON_RUNTIMES = {
  javascript: { language: "javascript", version: "18.15.0" },
  typescript: { language: "typescript", version: "5.0.3" },
  python: { language: "python", version: "3.10.0" },
  java: { language: "java", version: "15.0.2" },
  go: { language: "go", version: "1.16.2" },
  rust: { language: "rust", version: "1.68.2" },
  cpp: { language: "cpp", version: "10.2.0" },
  csharp: { language: "csharp", version: "6.12.0" },
  ruby: { language: "ruby", version: "3.0.1" },
  swift: { language: "swift", version: "5.3.3" },
} as const;

export type SupportedLanguage = keyof typeof PISTON_RUNTIMES;

export const SUPPORTED_LANGUAGES = Object.keys(PISTON_RUNTIMES) as SupportedLanguage[];
