import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                bg: {
                    primary: "#0f5c5e",       /* 毛毡 — 深青绿 */
                    card: "#0a4a4d",          /* 毛毡暗区 */
                    "card-hover": "#147a7e",    /* 毛毡亮区 */
                },
                wood: {
                    primary: "#8b5e3c",       /* 木纹主色 */
                    dark: "#6b4423",           /* 木纹暗纹 */
                    light: "#c49a6c",          /* 木纹亮纹 */
                },
                text: {
                    primary: "#f0fdf4",       /* 偏绿的暖白 */
                    secondary: "#a7f3d0",     /* 柔和青绿 */
                    muted: "#86efac",         /* 暗一点的青绿 */
                },
                accent: {
                    DEFAULT: "#2dd4bf",       /* 青绿 accent */
                    hover: "#14b8a6",
                },
            },
            borderRadius: {
                DEFAULT: "12px",
            },
            animation: {
                "card-flip": "cardFlip 0.6s ease-in-out",
                "card-fly": "cardFly 0.35s ease-out",
                "pulse-glow": "pulseGlow 2s ease-in-out infinite",
                shimmer: "shimmer 2s linear infinite",
                float: "float 3s ease-in-out infinite",
            },
            keyframes: {
                cardFlip: {
                    "0%": { transform: "rotateY(0deg)" },
                    "100%": { transform: "rotateY(180deg)" },
                },
                cardFly: {
                    "0%": { transform: "translateY(0) scale(1)", opacity: "1" },
                    "100%": { transform: "translateY(-100px) scale(0.5)", opacity: "0" },
                },
                pulseGlow: {
                    "0%, 100%": { boxShadow: "0 0 5px rgba(45, 212, 191, 0.5)" },
                    "50%": { boxShadow: "0 0 20px rgba(45, 212, 191, 0.8)" },
                },
                shimmer: {
                    "0%": { backgroundPosition: "-200% 0" },
                    "100%": { backgroundPosition: "200% 0" },
                },
                float: {
                    "0%, 100%": { transform: "translateY(0)" },
                    "50%": { transform: "translateY(-10px)" },
                },
            },
        },
    },
    plugins: [],
};

export default config;
