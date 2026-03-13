'use client';

import { useState, useEffect } from 'react';
import { UserIcon, ShieldIcon } from './icons.js';
import { getUsers, updateUserRole } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// User Card
// ─────────────────────────────────────────────────────────────────────────────

function UserCard({ user, onRoleChange }) {
  const [confirming, setConfirming] = useState(false);
  const [updating, setUpdating] = useState(false);
  const isAdmin = user.role === 'admin';
  const newRole = isAdmin ? 'user' : 'admin';
  const createdDate = new Date(user.createdAt).toLocaleDateString();

  async function handleRoleChange() {
    if (isAdmin && !confirming) {
      setConfirming(true);
      return;
    }
    setUpdating(true);
    setConfirming(false);
    const result = await updateUserRole(user.id, newRole);
    if (result?.success) {
      onRoleChange();
    }
    setUpdating(false);
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0 rounded-md bg-muted p-2">
          <UserIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Created {createdDate}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              isAdmin
                ? 'bg-purple-500/10 text-purple-500'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {isAdmin && <ShieldIcon size={10} />}
            {user.role}
          </span>
          {confirming ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleRoleChange}
                disabled={updating}
                className="text-[11px] px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 font-medium"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleRoleChange}
              disabled={updating}
              className="text-[11px] px-2 py-1 rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {updating ? 'Updating...' : isAdmin ? 'Demote to user' : 'Promote to admin'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  function loadUsers() {
    setLoading(true);
    getUsers()
      .then((data) => {
        if (Array.isArray(data)) setUsers(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <>
      {!loading && (
        <p className="text-sm text-muted-foreground mb-4">
          {users.length} user{users.length !== 1 ? 's' : ''} registered
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-border/50" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <UserIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No users found</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Users are created when they register or are added by an admin.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {users.map((user) => (
            <UserCard key={user.id} user={user} onRoleChange={loadUsers} />
          ))}
        </div>
      )}
    </>
  );
}
