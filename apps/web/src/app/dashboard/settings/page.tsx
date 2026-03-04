"use client";

import { useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const router = useRouter();

  async function handleSignOut() {
    setSignOutLoading(true);
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage(null);

    if (newPassword.length < 6) {
      setPwMessage({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setPwLoading(true);
    try {
      const supabase = createSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPwMessage({ type: "success", text: "Password updated successfully." });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update password.",
      });
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold">Settings</h3>
        <p className="text-muted-foreground">Manage your account.</p>
      </div>

      {/* Change Password */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h4 className="font-semibold">Change Password</h4>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-foreground">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Min. 6 characters"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-foreground">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Repeat new password"
            />
          </div>
          {pwMessage && (
            <p className={`text-sm ${pwMessage.type === "success" ? "text-emerald-500" : "text-red-500"}`}>
              {pwMessage.text}
            </p>
          )}
          <button
            type="submit"
            disabled={pwLoading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {pwLoading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>

      {/* Sign Out */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h4 className="font-semibold">Account</h4>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Sign out of your account</p>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signOutLoading}
            className="rounded-md border border-red-500/50 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
          >
            {signOutLoading ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
