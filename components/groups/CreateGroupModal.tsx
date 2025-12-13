"use client";

import { useState } from "react";
import { Group } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Globe, Loader2 } from "lucide-react";

interface CreateGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupCreated: (group: Group) => void;
}

export default function CreateGroupModal({ open, onOpenChange, onGroupCreated }: CreateGroupModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [defaultSpots, setDefaultSpots] = useState("10");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          visibility,
          defaultEventSpots: parseInt(defaultSpots) || 10,
          ...(spreadsheetId && { spreadsheetId }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.instructions) {
          setError(`${data.error}\n\n${data.instructions.join('\n')}`);
        } else {
          setError(data.error || 'Failed to create group');
        }
        return;
      }

      setName("");
      setDescription("");
      setVisibility("private");
      setDefaultSpots("10");
      setSpreadsheetId("");
      
      onGroupCreated(data.data);
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#F2EFE9] border-4 border-[#1A1A1A] max-w-md mx-2 sm:mx-auto rounded-none max-h-[85vh] overflow-y-auto shadow-[8px_8px_0_#1A1A1A]">
        <DialogHeader>
          <DialogTitle className="font-graffiti text-2xl text-[#FF5A00]">Create New Crew</DialogTitle>
          <DialogDescription className="text-[#1A1A1A]/60 font-body">
            Set up a new crew for your games
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="name" className="font-graffiti text-[#1A1A1A]">Crew Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Thursday Ballers"
              className="sketch-input"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="font-graffiti text-[#1A1A1A]">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Weekly basketball sessions at the local court"
              className="sketch-input resize-none"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label className="font-graffiti text-[#1A1A1A]">Visibility</Label>
            <div className="space-y-2">
              <div 
                onClick={() => setVisibility("private")}
                className={`flex items-center space-x-3 p-3 border-2 border-[#1A1A1A] cursor-pointer transition-all ${visibility === 'private' ? 'bg-[#1A1A1A] text-[#F2EFE9]' : 'bg-white hover:bg-[#F2EFE9]'}`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${visibility === 'private' ? 'border-[#F2EFE9]' : 'border-[#1A1A1A]'}`}>
                  {visibility === 'private' && <div className="w-2 h-2 rounded-full bg-current" />}
                </div>
                <Lock className="w-4 h-4" />
                <div className="flex-1">
                  <span className="font-graffiti">Private</span>
                  <p className={`text-xs font-body ${visibility === 'private' ? 'text-[#F2EFE9]/60' : 'text-[#1A1A1A]/60'}`}>Members join via invite code only</p>
                </div>
              </div>
              <div 
                onClick={() => setVisibility("public")}
                className={`flex items-center space-x-3 p-3 border-2 border-[#1A1A1A] cursor-pointer transition-all ${visibility === 'public' ? 'bg-[#7FFF00]' : 'bg-white hover:bg-[#F2EFE9]'}`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center border-[#1A1A1A]`}>
                  {visibility === 'public' && <div className="w-2 h-2 rounded-full bg-[#1A1A1A]" />}
                </div>
                <Globe className="w-4 h-4" />
                <div className="flex-1">
                  <span className="font-graffiti">Public</span>
                  <p className={`text-xs font-body ${visibility === 'public' ? 'text-[#1A1A1A]/70' : 'text-[#1A1A1A]/60'}`}>Anyone can find and join</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="spots" className="font-graffiti text-[#1A1A1A]">Default Spots</Label>
            <Input
              id="spots"
              type="number"
              min="1"
              max="50"
              value={defaultSpots}
              onChange={(e) => setDefaultSpots(e.target.value)}
              className="sketch-input w-24"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="spreadsheetId" className="font-graffiti text-[#1A1A1A]">
              Spreadsheet ID <span className="text-[#1A1A1A]/40 font-body">(optional)</span>
            </Label>
            <Input
              id="spreadsheetId"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="Leave empty for auto-creation"
              className="sketch-input text-sm"
            />
            <p className="text-xs text-[#1A1A1A]/40 font-body">
              If auto-creation fails, you&apos;ll need to create one manually
            </p>
          </div>

          {error && (
            <div className="p-3 bg-[#FF5A00]/10 border-2 border-[#FF5A00]">
              <p className="text-sm text-[#FF5A00] whitespace-pre-line font-body">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="sticker-btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="sticker-btn disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                  Creating...
                </>
              ) : (
                'Create Crew'
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
