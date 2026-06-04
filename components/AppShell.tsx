"use client";

import { ReactNode } from "react";
import Footer from "@/components/Footer";
import { UserProfile } from "@/lib/types";

interface AppShellProps {
  children: ReactNode;
  session: any;
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
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
