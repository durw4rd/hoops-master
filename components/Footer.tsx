"use client";

import { APP_VERSION } from "@/lib/appVersion";

export default function Footer() {
  return (
    <footer className="bg-asphalt py-4 mt-auto border-t-4 border-terracotta">
      <div className="max-w-4xl mx-auto px-4 space-y-1">
        <p className="text-center font-marker text-sm text-sticker-white">
          Love the run.{" "}
          <span className="text-terracotta">Leave the whining at home.</span>
        </p>
        <p className="text-center font-body text-[10px] text-sticker-white/40">
          v{APP_VERSION}
        </p>
      </div>
    </footer>
  );
}
