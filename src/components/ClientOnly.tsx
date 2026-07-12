"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * 仅在客户端渲染的容器（避免 SSR 时 WebGL/Canvas 报错）
 */
export function ClientOnly({ children }: { children: ReactNode }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="w-full h-full bg-bg-primary" />;
    }

    return <>{children}</>;
}
