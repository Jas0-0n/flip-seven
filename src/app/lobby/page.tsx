// ============================================================
// src/app/lobby/page.tsx — 独立大厅页面（可选路由）
// ============================================================
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LobbyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
