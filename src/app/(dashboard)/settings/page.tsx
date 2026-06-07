"use client";

import { Bell, Globe, Key, Monitor, Moon, Palette, Settings, Sun, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { CURRENCIES, getCurrency, setCurrency, type CurrencyCode } from "@/lib/currency";
import { useTheme, type Theme } from "@/lib/theme-context";
import { useUser } from "@/lib/user-context";

export default function SettingsPage() {
  const { user, refresh } = useUser();
  const { theme, setTheme } = useTheme();
  const [activeCurrency, setActiveCurrency] = useState<CurrencyCode>(getCurrency());
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    function sync() { setActiveCurrency(getCurrency()); }
    window.addEventListener("currency-change", sync);
    return () => window.removeEventListener("currency-change", sync);
  }, []);

  function handleCurrencyChange(code: CurrencyCode) {
    setCurrency(code);
    setActiveCurrency(code);
    toast.success(`Currency changed to ${code}`);
  }

  function handleThemeChange(t: Theme) {
    setTheme(t);
    toast.success(`Theme set to ${t}`);
  }

  async function handleProfileSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.patch(`/accounts/users/${user.id}/`, {
        first_name: fd.get("first_name"),
        last_name: fd.get("last_name"),
        phone: fd.get("phone"),
      });
      toast.success("Profile updated");
      refresh();
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setChangingPw(true);
    const fd = new FormData(e.currentTarget);
    const newPw = fd.get("new_password") as string;
    const confirmPw = fd.get("confirm_password") as string;
    if (newPw !== confirmPw) {
      toast.error("Passwords do not match");
      setChangingPw(false);
      return;
    }
    if (newPw.length < 8) {
      toast.error("Password must be at least 8 characters");
      setChangingPw(false);
      return;
    }
    try {
      await api.post("/accounts/users/change-password/", {
        old_password: fd.get("old_password"),
        new_password: newPw,
      });
      toast.success("Password changed successfully");
      e.currentTarget.reset();
    } catch {
      toast.error("Failed to change password. Check your current password.");
    } finally {
      setChangingPw(false);
    }
  }

  const inputClass = "flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors dark:bg-[hsl(222,15%,13%)] dark:border-[hsl(222,15%,20%)] dark:text-gray-200";
  const labelClass = "text-xs font-medium text-gray-600 dark:text-gray-400";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gray-600 to-gray-700">
          <Settings className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500">Configure your platform preferences</p>
        </div>
      </div>

      {/* Profile Section */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <User className="h-5 w-5 text-teal-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Profile</h2>
            <p className="text-xs text-gray-500">Update your personal information</p>
          </div>
        </div>
        {user && (
          <form onSubmit={handleProfileSave} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass}>First Name</label>
                <input name="first_name" defaultValue={user.first_name} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Last Name</label>
                <input name="last_name" defaultValue={user.last_name} className={inputClass} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass}>Email</label>
                <input value={user.email} disabled className="flex h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 cursor-not-allowed" />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Phone</label>
                <input name="phone" defaultValue={user.phone} placeholder="+92 300 1234567" className={inputClass} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass}>Username</label>
                <input value={user.username} disabled className="flex h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 cursor-not-allowed" />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Role</label>
                <input value={user.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} disabled className="flex h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 capitalize cursor-not-allowed" />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30 disabled:opacity-50">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Change Password */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <Key className="h-5 w-5 text-teal-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Change Password</h2>
            <p className="text-xs text-gray-500">Update your account password</p>
          </div>
        </div>
        <form onSubmit={handlePasswordChange} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className={labelClass}>Current Password</label>
              <input name="old_password" type="password" required placeholder="••••••••" className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>New Password</label>
              <input name="new_password" type="password" required minLength={8} placeholder="••••••••" className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Confirm New Password</label>
              <input name="confirm_password" type="password" required minLength={8} placeholder="••••••••" className={inputClass} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={changingPw} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">
              {changingPw ? "Changing..." : "Change Password"}
            </button>
          </div>
        </form>
      </div>

      {/* Currency Section */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <Globe className="h-5 w-5 text-teal-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Currency</h2>
            <p className="text-xs text-gray-500">Select the default currency for invoices, procurement, and financial reports</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => handleCurrencyChange(c.code)}
              className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-all ${
                activeCurrency === c.code
                  ? "border-teal-500 bg-teal-50/50 ring-1 ring-teal-500/30"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-base font-semibold text-gray-700">
                {c.symbol}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">{c.code}</p>
                <p className="text-xs text-gray-500">{c.name}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Appearance Section */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <Palette className="h-5 w-5 text-teal-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Appearance</h2>
            <p className="text-xs text-gray-500">Choose your preferred theme</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {([
            { value: "light" as Theme, label: "Light", icon: Sun, desc: "Clean light interface" },
            { value: "dark" as Theme, label: "Dark", icon: Moon, desc: "Easy on the eyes" },
            { value: "system" as Theme, label: "System", icon: Monitor, desc: "Follow OS preference" },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleThemeChange(opt.value)}
              className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-all ${
                theme === opt.value
                  ? "border-teal-500 bg-teal-50/50 ring-1 ring-teal-500/30 dark:bg-teal-500/10"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-[hsl(222,15%,20%)] dark:hover:border-[hsl(222,15%,25%)] dark:hover:bg-white/5"
              }`}
            >
              <opt.icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-200">{opt.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <Bell className="h-5 w-5 text-teal-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
            <p className="text-xs text-gray-500">Manage how you receive notifications</p>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {[
            { key: "ticket_updates", label: "Ticket Updates", desc: "When tickets are assigned, updated, or resolved" },
            { key: "maintenance_due", label: "Maintenance Reminders", desc: "Before upcoming scheduled maintenance" },
            { key: "warranty_expiry", label: "Warranty Expiry Alerts", desc: "When device warranties are about to expire" },
            { key: "low_stock", label: "Low Stock Alerts", desc: "When inventory items fall below minimum stock level" },
            { key: "invoice_overdue", label: "Invoice Overdue", desc: "When invoices pass their due date" },
          ].map((pref) => (
            <NotificationToggle key={pref.key} id={pref.key} label={pref.label} description={pref.desc} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationToggle({ id, label, description }: { id: string; label: string; description: string }) {
  const storageKey = `notif_${id}`;
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) setEnabled(stored === "true");
  }, [storageKey]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(storageKey, String(next));
    toast.success(`${label} ${next ? "enabled" : "disabled"}`);
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-[hsl(222,15%,16%)] p-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.03]">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-200">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enabled ? "bg-teal-500" : "bg-gray-200"}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}
