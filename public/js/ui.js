// Shared UI helpers: escaping, formatting, modals, toasts, small charts, CSV.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- formatting ----------
export function fmtDT(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function fmtDur(min) {
  if (min == null || isNaN(min)) return '—';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h >= 100 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}
export const fmtHours = (h) => (h == null ? '—' : h >= 100 ? `${Math.round(h)} h` : `${h} h`);

const p2 = (n) => String(n).padStart(2, '0');
export function toLocalInput(v) {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export const fromLocalInput = (s) => (s ? new Date(s).toISOString() : '');
export const todayStr = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

export function currentShift(d = new Date()) {
  const h = d.getHours();
  return h >= 6 && h < 14 ? 'A' : h >= 14 && h < 22 ? 'B' : 'C';
}

export const statusPill = (s) => `<span class="pill s-${esc(String(s).replace(/\s/g, ''))}">${esc(s)}</span>`;
export const prioPill = (p) => `<span class="pill p-${esc(p)}">${esc(p)}</span>`;

export const options = (list, selected, placeholder) =>
  (placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '') +
  list.map((v) => {
    const [val, label] = Array.isArray(v) ? v : [v, v];
    return `<option value="${esc(val)}" ${val === selected ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');

// ---------- icons ----------
const ICONS = {
  dashboard: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  machine: '<path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5-2.2-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/>',
  register: '<path d="M19 3h-4.2a3 3 0 0 0-5.6 0H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm1 14h-6v-2h6v2zm3-4H7v-2h9v2zm0-4H7V7h9v2z"/>',
  completion: '<path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>',
  reports: '<path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/>',
  settings: '<path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name]}</svg>`;

// ---------- toast ----------
let toastTimer;
export function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), isError ? 4500 : 2400);
}

// ---------- modal ----------
export function modal(title, content, { narrow = false, onMount, dismissable = true } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal' + (narrow ? ' narrow' : '');
  dlg.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2>${dismissable ? '<button type="button" class="icon-btn" data-close aria-label="Close">×</button>' : ''}</div><div class="modal-body">${content}</div>`;
  document.body.append(dlg);
  const close = () => dlg.close();
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  if (!dismissable) dlg.addEventListener('cancel', (e) => e.preventDefault());
  dlg.showModal();
  onMount?.(dlg, close);
  return { dlg, close };
}

export const showError = (root, msg) => {
  const el = $('.form-error', root);
  if (!el) return;
  el.textContent = msg || '';
  el.hidden = !msg;
};

export function confirmBox(message, { okText = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const { dlg } = modal('Please confirm', `<p>${esc(message)}</p>
      <div class="form-actions"><button class="btn" data-close type="button">Cancel</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-ok type="button">${esc(okText)}</button></div>`, {
      narrow: true,
      onMount: (d, close) => $('[data-ok]', d).addEventListener('click', () => { result = true; close(); }),
    });
    dlg.addEventListener('close', () => resolve(result));
  });
}

export function promptBox(title, label, { okText = 'Submit', required = true, type = 'text', value = '' } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const { dlg } = modal(title, `<form><label class="field">${esc(label)}${required ? ' *' : ''}
      <textarea name="v" rows="3">${esc(value)}</textarea></label><p class="form-error" hidden></p>
      <div class="form-actions"><button class="btn" data-close type="button">Cancel</button>
      <button class="btn primary" type="submit">${esc(okText)}</button></div></form>`, {
      narrow: true,
      onMount: (d, close) => {
        $('form', d).addEventListener('submit', (e) => {
          e.preventDefault();
          const v = e.target.v.value.trim();
          if (required && !v) return showError(d, `${label} is required`);
          result = v;
          close();
        });
      },
    });
    dlg.addEventListener('close', () => resolve(result));
  });
}

// ---------- forms ----------
export function formToObj(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}

// ---------- charts ----------
export function barChart(items, { valueKey = 'downtimeMin', format = fmtDur, label = (i) => i.key, empty = 'No data for this period' } = {}) {
  const rows = items.filter((i) => i[valueKey] > 0 || i.count > 0);
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  const max = Math.max(...rows.map((i) => i[valueKey]), 1);
  return `<div class="bars">${rows.map((i) => `
    <div class="bar-row"><span class="lbl" title="${esc(label(i))}">${esc(label(i))}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, (i[valueKey] / max) * 100)}%"></div></div>
    <span class="bar-val">${esc(format(i[valueKey]))}${i.count != null ? ` · ${i.count}×` : ''}</span></div>`).join('')}</div>`;
}

// Column chart: counts as bars with downtime hours as a second, lighter series
export function trendChart(points, unit) {
  if (!points.length) return '<div class="empty">No data for this period</div>';
  const W = 640, H = 160, padL = 26, padB = 20, padT = 8;
  const maxC = Math.max(...points.map((p) => p.count), 1);
  const bw = (W - padL) / points.length;
  const label = (p) => (unit === 'day' ? p.label.slice(8) : p.label.slice(2));
  const step = Math.ceil(points.length / 14);
  const bars = points.map((p, i) => {
    const h = (p.count / maxC) * (H - padB - padT);
    const x = padL + i * bw + bw * 0.15;
    return `<rect class="col" x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="2">
      <title>${esc(p.label)}: ${p.count} breakdown(s), ${esc(fmtDur(p.downtimeMin))} downtime</title></rect>
      ${i % step === 0 ? `<text x="${(x + bw * 0.35).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(label(p))}</text>` : ''}`;
  }).join('');
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Breakdowns trend">
    <line x1="${padL}" y1="${H - padB}" x2="${W}" y2="${H - padB}" stroke="currentColor" opacity=".2"/>
    <text x="2" y="${padT + 8}">${maxC}</text><text x="2" y="${H - padB}">0</text>${bars}</svg>
    <div class="legend"><span><i style="background:var(--accent)"></i>Breakdowns per ${unit}</span></div>`;
}

// ---------- CSV ----------
export function downloadCsv(filename, header, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
