import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'liquid-glass' | 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>(() => {
        // Check localStorage first
        const saved = localStorage.getItem('theme');
        if (saved === 'liquid-glass' || saved === 'light' || saved === 'dark') return saved;
        // Default to liquid-glass
        return 'liquid-glass';
    });

    useEffect(() => {
        const body = document.body;
        const html = document.documentElement;

        // Legacy body classes — existing style.css / liquid-glass.css rely on these.
        body.classList.remove('light-mode', 'dark-mode');
        if (theme === 'light') {
            body.classList.add('light-mode');
        } else if (theme === 'dark') {
            body.classList.add('dark-mode');
        }

        // Opt-in to refreshed shell styles (shell.css scopes itself under
        // body.ctm-v2 to avoid colliding with legacy liquid-glass rules).
        body.classList.add('ctm-v2');

        // New design-token channel. liquid-glass is a dark-family skin; map it
        // to data-theme="dark" so OKLCH tokens resolve to dark values.
        const dataTheme = theme === 'light' ? 'light' : 'dark';
        html.setAttribute('data-theme', dataTheme);

        localStorage.setItem('theme', theme);
    }, [theme]);

    // Cycle: liquid-glass → light → dark → liquid-glass
    const toggleTheme = () => {
        setTheme(prev => {
            if (prev === 'liquid-glass') return 'light';
            if (prev === 'light') return 'dark';
            return 'liquid-glass';
        });
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
