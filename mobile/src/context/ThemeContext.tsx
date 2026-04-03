import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { colorsRealize, ColorScheme } from "../theme/colorsRealize";

type ThemeContextType = {
  isDark: boolean;
  colorScheme: ColorScheme;
  colors: typeof colorsRealize.light;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemColorScheme === "dark");

  useEffect(() => {
    if (systemColorScheme) {
      setIsDark(systemColorScheme === "dark");
    }
  }, [systemColorScheme]);

  const colorScheme: ColorScheme = isDark ? "dark" : "light";
  const colors = colorsRealize[colorScheme];

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  return (
    <ThemeContext.Provider value={{ isDark, colorScheme, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
