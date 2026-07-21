"use client";

import type { Session } from "next-auth";
import { ReactNode } from "react";
import Footer from "@/components/Footer";
import UpdateBanner from "@/components/UpdateBanner";
import { UserProfile } from "@/lib/types";

interface AppShellProps {
  children: ReactNode;
  session: Session | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenProfile?: () => void;
  userProfile?: UserProfile | null;
}

export default function AppShell({
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen concrete-bg flex flex-col">
      <UpdateBanner />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
