import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
    title: "FLIP 7 - 在线对战",
    description: "2-4人实时在线卡牌对战游戏",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: "#0f5c5e",
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="zh-CN">
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>{children}</body>
        </html>
    );
}
