import { api } from './api.js';

// Shared, session-wide data: current user, master lists, users, machines.
export const state = {
  me: null,
  settings: null,
  users: [],
  machines: [],
  roles: [],
};

export async function loadBootstrap() {
  const b = await api.get('/api/bootstrap');
  Object.assign(state, { me: b.me, settings: b.settings, users: b.users, roles: b.roles });
  state.machines = await api.get('/api/machines');
}

export const refreshMachines = async () => (state.machines = await api.get('/api/machines'));
export const refreshUsers = async () => (state.users = await api.get('/api/users'));

// ----- permissions (mirror of the server rules; the server is the real gate) -----
const role = () => state.me?.role;
export const can = {
  editMachines: () => ['admin', 'supervisor'].includes(role()),
  report: () => ['admin', 'supervisor', 'technician', 'operator'].includes(role()),
  assign: () => ['admin', 'supervisor'].includes(role()),
  work: () => ['admin', 'supervisor', 'technician'].includes(role()),
  close: () => ['admin', 'supervisor'].includes(role()),
  admin: () => role() === 'admin',
};

export const userById = (id) => state.users.find((u) => u.id === id);
export const machineById = (id) => state.machines.find((m) => m.id === id);
export const technicians = () => state.users.filter((u) => u.active && ['technician', 'supervisor', 'admin'].includes(u.role));
