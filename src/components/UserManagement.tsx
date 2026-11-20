import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, UserRound, X } from 'lucide-react';
import { api } from '../api';

interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: 'manager' | 'staff';
  is_active: boolean;
  created_at: string;
}

interface UserForm {
  name: string;
  email: string;
  role: TeamMember['role'];
  password: string;
}

const EMPTY_FORM: UserForm = { name: '', email: '', role: 'staff', password: '' };

export function UserManagement({ token }: { token: string }) {
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [editingUser, setEditingUser] = useState<TeamMember | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.admin.users(token);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load team members.');
      }
      setUsers(data.users);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load team members.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function openCreateForm() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setError(null);
    setNotice(null);
    setFormOpen(true);
  }

  function openEditForm(user: TeamMember) {
    setEditingUser(user);
    setForm({ name: user.name, email: user.email, role: user.role, password: '' });
    setError(null);
    setNotice(null);
    setFormOpen(true);
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        ...(editingUser
          ? (form.password ? { new_password: form.password } : {})
          : { password: form.password }),
      };
      const response = editingUser
        ? await api.admin.updateUser(editingUser.id, payload, token)
        : await api.admin.createUser(payload, token);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save team member.');
      }
      setFormOpen(false);
      setNotice(editingUser ? 'Team member updated.' : 'Team member created.');
      await loadUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save team member.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: TeamMember) {
    setError(null);
    setNotice(null);
    try {
      const response = await api.admin.updateUser(user.id, { is_active: !user.is_active }, token);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to update account status.');
      }
      setNotice(`${user.name} ${user.is_active ? 'deactivated' : 'activated'}.`);
      await loadUsers();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update account status.');
    }
  }

  async function removeUser(user: TeamMember) {
    if (!window.confirm(`Remove ${user.name} from this restaurant? This cannot be undone.`)) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const response = await api.admin.deleteUser(user.id, token);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to remove team member.');
      }
      setNotice(`${user.name} was removed.`);
      await loadUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to remove team member.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-stone-900">Team Management</h2>
          <p className="mt-1 text-sm text-stone-500">Manage manager and staff accounts for this restaurant.</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326]"
        >
          <Plus className="w-4 h-4" />
          Add Team Member
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {formOpen && (
        <form onSubmit={handleSave} className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-stone-900">
              {editingUser ? 'Edit Team Member' : 'Create Team Member'}
            </h3>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="p-1 text-stone-400 hover:text-stone-700"
              aria-label="Close form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-stone-700">
              Name
              <input
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700">
              Email
              <input
                required
                type="email"
                maxLength={255}
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700">
              Role
              <select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as TeamMember['role'] })}
                className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-stone-700">
              {editingUser ? 'New password (optional)' : 'Password'}
              <input
                required={!editingUser}
                minLength={8}
                maxLength={100}
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
              {editingUser && <span className="mt-1 block font-normal text-stone-500">Leave blank to keep the current password.</span>}
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-3 py-2 border border-stone-300 rounded-lg text-xs font-medium text-stone-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-[#1B4332] text-white rounded-lg text-xs font-medium disabled:opacity-60"
            >
              {saving ? 'Saving…' : editingUser ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-900">Team Accounts</h3>
          <span className="text-xs text-stone-500">{users.length} member{users.length === 1 ? '' : 's'}</span>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-stone-500">Loading team members…</div>
        ) : error && users.length === 0 ? (
          <div className="p-6 text-sm text-stone-500">Team accounts could not be loaded.</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <UserRound className="w-8 h-8 mx-auto text-stone-300" />
            <p className="mt-2 text-sm text-stone-600">No team accounts yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Name</th>
                  <th className="py-3 px-4 font-medium">Email</th>
                  <th className="py-3 px-4 font-medium">Role</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-stone-50/70">
                    <td className="py-3 px-4 font-medium text-stone-900">{user.name}</td>
                    <td className="py-3 px-4 text-stone-600">{user.email}</td>
                    <td className="py-3 px-4 capitalize text-stone-600">{user.role}</td>
                    <td className="py-3 px-4">
                      <span className={user.is_active ? 'text-xs font-medium text-emerald-700' : 'text-xs font-medium text-red-600'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEditForm(user)}
                        className="p-1.5 text-stone-500 hover:text-stone-900"
                        aria-label={`Edit ${user.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleActive(user)}
                        className="px-2 py-1 text-xs text-stone-600 hover:text-stone-900"
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeUser(user)}
                        className="p-1.5 text-stone-400 hover:text-red-600"
                        aria-label={`Remove ${user.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
