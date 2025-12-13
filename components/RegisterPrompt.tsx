import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RegisterPromptProps {
  email: string;
  onRegister: (name: string) => Promise<void>;
}

const RegisterPrompt: React.FC<RegisterPromptProps> = ({ email, onRegister }) => {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setLoading(true);
    try {
      await onRegister(name.trim());
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-orange-200 rounded-lg p-6 max-w-md mx-auto mt-8 shadow">
      <h2 className="text-2xl font-bold mb-2 text-center">Register to Use Summer Hoops</h2>
      <p className="mb-4 text-center text-gray-700">
        You need to register before you can claim or offer spots.<br />
        Please enter your name to register with the app.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <Input value={email} disabled className="bg-gray-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name"
            disabled={loading || success}
          />
        </div>
        {error && <div className="text-red-600 text-sm text-center">{error}</div>}
        {success && <div className="text-green-600 text-sm text-center">Registration successful! You can now use the app.</div>}
        <Button type="submit" disabled={loading || success} className="w-full">
          {loading ? "Registering..." : "Register"}
        </Button>
      </form>
    </div>
  );
};

export default RegisterPrompt; 