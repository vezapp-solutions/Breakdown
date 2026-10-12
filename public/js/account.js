import { api } from './api.js';
import { state } from './state.js';
import { $, modal, showError, toast } from './ui.js';

// forced = first sign-in / admin reset: dialog cannot be dismissed until a new password is set.
export function changePasswordDialog(forced, onDone) {
  const html = `${forced ? '<p class="banner">You must choose a new password before continuing.</p>' : ''}
    <form class="form-grid" style="grid-template-columns:1fr" novalidate>
      <label class="field">Current password<input name="current" type="password" autocomplete="current-password" required></label>
      <label class="field">New password<input name="next" type="password" autocomplete="new-password" minlength="8" required><span class="hint">At least 8 characters.</span></label>
      <label class="field">Confirm new password<input name="confirm" type="password" autocomplete="new-password" required></label>
      <div><p class="form-error" hidden></p><div class="form-actions">
        ${forced ? '' : '<button class="btn" data-close type="button">Cancel</button>'}<button class="btn primary" type="submit">Change password</button></div></div>
    </form>`;
  modal('Change password', html, {
    narrow: true,
    dismissable: !forced,
    onMount: (dlg, close) => $('form', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.next.value !== f.confirm.value) return showError(dlg, 'The new passwords do not match');
      try {
        await api.post('/api/auth/password', { current: f.current.value, next: f.next.value });
        state.me.mustChangePassword = false;
        close();
        toast('Password changed');
        onDone?.();
      } catch (err) { showError(dlg, err.message); }
    }),
  });
}
