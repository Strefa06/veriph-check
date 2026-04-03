// ReAIlize color palette - trustworthy, professional, blue-focused
export const colorsRealize = {
  // Light mode
  light: {
    bgPrimary: "#f8fafb",
    bgSecondary: "#eef2f7",
    bgTertiary: "#e8eef5",
    card: "#ffffff",
    text: "#1a202c",
    textSecondary: "#4a5568",
    textTertiary: "#718096",
    border: "#cbd5e0",
    accent: "#2563eb", // Professional blue
    accentLight: "#dbeafe",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    overlay: "rgba(0, 0, 0, 0.5)"
  },
  // Dark mode
  dark: {
    bgPrimary: "#0f1419",
    bgSecondary: "#1a202c",
    bgTertiary: "#2d3748",
    card: "#1f2937",
    text: "#f8fafc",
    textSecondary: "#cbd5e0",
    textTertiary: "#a0aec0",
    border: "#374151",
    accent: "#3b82f6", // Lighter blue for dark mode
    accentLight: "#1e3a8a",
    success: "#34d399",
    warning: "#fbbf24",
    danger: "#f87171",
    overlay: "rgba(0, 0, 0, 0.7)"
  }
};

export type ColorScheme = keyof typeof colorsRealize;
