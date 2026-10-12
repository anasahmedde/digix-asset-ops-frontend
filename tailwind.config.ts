import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import tailwindAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        // Wide and tall enough to pin the dashboard's desk column beside
        // the page; below this it sits in the flow at its natural size.
        desk: { raw: "(min-width: 1280px) and (min-height: 1030px)" },
      },
      fontFamily: {
        // San Francisco is Apple's own and is not licensed for the web, so
        // the stack asks the platform for it first — on a Mac, iPhone or iPad
        // this *is* SF. Inter follows: it was drawn as an SF-alike and keeps
        // the same proportions everywhere else.
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "SF Pro Display",
          "var(--font-sans)",
          ...defaultTheme.fontFamily.sans,
        ],
        // SF Mono where the platform has it, then the loaded face.
        mono: ["ui-monospace", "SF Mono", "SFMono-Regular", "var(--font-mono)", ...defaultTheme.fontFamily.mono],
      },
      fontSize: {
        // The smallest size the interface uses: labels, badges, helper text.
        // 11px is the floor — 9 and 10px were unreadable on most screens.
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      colors: {
        // The logo's blue, as a scale: every "teal" class on the screens is
        // this now, so the theme colour is the brand's and nothing else's.
        teal: {
          50: "#eef4f7", 100: "#dff3eb", 200: "#c3dae3", 300: "#93b8c9", 400: "#5c8aa3",
          500: "#1b405b", 600: "#163144", 700: "#12293a", 800: "#0e2030", 900: "#0a1824", 950: "#060f17",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          active: "hsl(var(--sidebar-active))",
        },
      },
      borderRadius: {
        "2xl": "calc(var(--radius) + 0.5rem)",
        xl: "var(--radius)",
        lg: "calc(var(--radius) - 0.25rem)",
        md: "calc(var(--radius) - 0.375rem)",
        sm: "calc(var(--radius) - 0.5rem)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        float: "var(--shadow-float)",
        // The active pill throws a little of its own colour.
        glow: "0 8px 20px -8px hsl(var(--primary) / 0.7)",
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;
