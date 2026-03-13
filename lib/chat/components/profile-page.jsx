'use client';

import { useState } from 'react';
import { PageLayout } from './page-layout.js';
import { UserIcon } from './icons.js';
import { updatePassword } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function ProfilePage({ session }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }

  const user = session?.user;
  const role = user?.role || 'user';
  const email = user?.email || '—';

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);

    // Client-side validation
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }

    setSaving(true);
    try {
      const result = await updatePassword(currentPassword, newPassword);
      if (result?.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Password updated successfully.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An unexpected error occurred. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="rounded-full bg-muted p-3">
          <UserIcon size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Profile</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your account settings.</p>
        </div>
      </div>

      {/* User Info */}
      <section className="mb-8">
        <h2 className="text-base font-semibold mb-4">Account Details</h2>
        <div className="rounded-lg border bg-card p-6 flex flex-col gap-4 max-w-lg">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</p>
            <p className="text-sm font-mono">{email}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</p>
            <div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  role === 'admin'
                    ? 'bg-violet-500/10 text-violet-500'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {role === 'admin' ? 'Admin' : 'User'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Password Change Form */}
      <section>
        <h2 className="text-base font-semibold mb-4">Change Password</h2>
        <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6 flex flex-col gap-4 max-w-lg">
          {/* Current Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="current-password">
              Current Password
            </label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              disabled={saving}
            />
          </div>

          {/* New Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="new-password">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              disabled={saving}
            />
          </div>

          {/* Confirm New Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="confirm-password">
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              disabled={saving}
            />
          </div>

          {/* Message */}
          {message && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                message.type === 'success'
                  ? 'bg-green-500/10 text-green-600'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Update Password'}
            </button>
          </div>
        </form>
      </section>
    </PageLayout>
  );
}
