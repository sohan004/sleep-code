import { Suspense } from "react";
import { EditorShell } from "@/components/editor/EditorShell";

export const metadata = {
  title: { absolute: "Editor" },
  robots: { index: false, follow: false },
};

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#1e1e1e]" />}>
      <EditorShell />
    </Suspense>
  );
}
