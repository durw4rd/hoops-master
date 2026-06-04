"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface OnboardingScreenProps {
  defaultUsername?: string;
  onComplete: () => void;
}

export default function OnboardingScreen({ defaultUsername, onComplete }: OnboardingScreenProps) {
  const [username, setUsername] = useState(defaultUsername || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/user/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save username");
        return;
      }
      onComplete();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="marker-card p-6 sm:p-8 max-w-md w-full space-y-5">
          <div className="space-y-1">
            <h1 className="graffiti-title text-3xl">Pick your tag</h1>
            <p className="text-asphalt/70 font-body text-sm font-marker transform -rotate-1">
              Tag the wall. Choose the name your crew will see.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="username" className="font-graffiti text-asphalt">
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g., Micha"
                maxLength={30}
                autoFocus
                className="sketch-input w-full"
              />
            </div>

            {error && (
              <div className="graffiti-error-box">
                <p className="graffiti-error-text font-body">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || username.trim().length < 2}
              className="sticker-btn w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Tag it"}
            </button>
          </form>
      </div>
    </div>
  );
}
