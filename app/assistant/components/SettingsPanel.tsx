'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import { exportAllData, importAllData, deleteAllData, type ImportMode } from '@/lib/datacenter';

/** Typed to unlock the delete button — a deliberate step for an irreversible action. */
const DELETE_CONFIRM_WORD = 'DELETE';

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
};

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingModeRef = useRef<ImportMode>('merge');
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteWord, setDeleteWord] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const t = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [open, shouldRender]);

  const handleExport = useCallback(() => {
    const data = exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `youtask-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const triggerImport = useCallback((mode: ImportMode) => {
    if (mode === 'override') {
      setConfirmOverride(true);
      return;
    }
    pendingModeRef.current = mode;
    fileInputRef.current?.click();
  }, []);

  const confirmOverrideImport = useCallback(() => {
    setConfirmOverride(false);
    pendingModeRef.current = 'override';
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      importAllData(json, pendingModeRef.current);
      setStatus({ text: 'Data imported successfully.' });
    } catch {
      setStatus({ text: 'Could not import that file — make sure it is a valid backup JSON.', error: true });
    }
  }, []);

  const openDeleteConfirm = () => {
    setDeleteWord('');
    setDeleteError('');
    setConfirmDelete(true);
  };

  const closeDeleteConfirm = () => {
    if (deleting) return;
    setConfirmDelete(false);
  };

  const handleDeleteAll = async () => {
    if (deleteWord !== DELETE_CONFIRM_WORD || deleting) return;
    setDeleting(true);
    setDeleteError('');
    const result = await deleteAllData();
    setDeleting(false);
    if (result.ok) {
      setConfirmDelete(false);
      setStatus({ text: 'All your data was deleted.' });
    } else {
      setDeleteError(result.message);
    }
  };

  if (!shouldRender) return null;

  return (
    <>
      <style>{`
        @keyframes settingsScreenIn {
          from { transform: translateX(24px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes settingsScreenOut {
          from { transform: translateX(0);    opacity: 1; }
          to   { transform: translateX(24px); opacity: 0; }
        }
      `}</style>
      <div
        className="fixed inset-0 z-[10050] flex flex-col overflow-y-auto"
        style={{
          background: 'var(--assistant-bg)',
          color: 'var(--assistant-text)',
          animation: isClosing
            ? 'settingsScreenOut 0.22s ease-out both'
            : 'settingsScreenIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both',
        }}
      >
        <div
          className="sticky top-0 flex items-center gap-3 px-4 py-4 md:px-8"
          style={{ borderBottom: '1px solid var(--assistant-border-soft)', background: 'var(--assistant-bg)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${classes.panelBtn}`}
            aria-label="Back"
            title="Back"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3 4.5 8l5 5" />
            </svg>
          </button>
          <h1 className="text-[17px] font-semibold">Settings</h1>
        </div>

        <div className="mx-auto w-full max-w-[560px] flex-1 px-4 py-6 md:px-8">
          <div className="space-y-6">
            <section>
              <h2 className="text-[14px] font-medium mb-1.5" style={{ color: 'var(--assistant-text-muted)' }}>
                Export data
              </h2>
              <p className="text-[14px] mb-3" style={{ color: 'var(--assistant-text-soft)' }}>
                Download all your lists, habits, reminders and checklists as a single JSON file.
              </p>
              <button
                type="button"
                onClick={handleExport}
                className={`w-full max-w-[280px] rounded-lg px-3.5 py-2.5 text-left text-[14px] font-medium transition-colors ${classes.panelBtn}`}
              >
                Export data
              </button>
            </section>

            <div style={{ borderTop: '1px solid var(--assistant-border-soft)' }} />

            <section>
              <h2 className="text-[14px] font-medium mb-1.5" style={{ color: 'var(--assistant-text-muted)' }}>
                Import data
              </h2>
              <p className="text-[14px] mb-3" style={{ color: 'var(--assistant-text-soft)' }}>
                Restore data from a previously exported JSON file.
              </p>
              <div className="flex flex-col gap-2 max-w-[280px]">
                <button
                  type="button"
                  onClick={() => triggerImport('override')}
                  className={`w-full rounded-lg px-3.5 py-2.5 text-left text-[14px] transition-colors ${classes.panelBtn}`}
                >
                  Override existing data
                </button>
                <button
                  type="button"
                  onClick={() => triggerImport('merge')}
                  className={`w-full rounded-lg px-3.5 py-2.5 text-left text-[14px] transition-colors ${classes.panelBtn}`}
                >
                  Add to existing data
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleFileChange}
              />
            </section>

            <div style={{ borderTop: '1px solid var(--assistant-border-soft)' }} />

            <section
              className="rounded-xl p-4"
              style={{
                border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
                background: 'color-mix(in srgb, #ef4444 5%, transparent)',
              }}
            >
              <h2 className="text-[14px] font-semibold mb-1.5" style={{ color: 'var(--assistant-danger-text)' }}>
                Danger zone
              </h2>
              <p className="text-[14px] mb-3" style={{ color: 'var(--assistant-text-soft)' }}>
                Permanently delete all your lists, tasks, habits, reminders and checklists — on this device and on the server. This can&apos;t be undone.
              </p>
              <button
                type="button"
                onClick={openDeleteConfirm}
                className={`w-full max-w-[280px] rounded-lg px-3.5 py-2.5 text-left text-[14px] font-medium transition-colors ${classes.panelBtnDanger}`}
              >
                Delete all data
              </button>
            </section>

            {status && (
              <div
                className="max-w-[280px] rounded-lg px-3 py-2 text-[13px]"
                style={{
                  border: '1px solid color-mix(in srgb, var(--assistant-accent) 25%, transparent)',
                  background: status.error
                    ? 'rgba(248,113,113,.08)'
                    : 'color-mix(in srgb, var(--assistant-accent) 10%, transparent)',
                  color: status.error ? '#fca5a5' : 'var(--assistant-accent)',
                }}
              >
                {status.text}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmOverride && (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center p-5">
          <button
            type="button"
            className="fixed inset-0"
            style={{ background: 'var(--assistant-overlay)' }}
            onClick={() => setConfirmOverride(false)}
            aria-label="Cancel"
          />
          <div
            className="relative z-10 w-full max-w-[360px] rounded-2xl p-5 shadow-2xl"
            style={{
              background: 'var(--assistant-bg)',
              color: 'var(--assistant-text)',
              border: '1px solid var(--assistant-border-soft)',
            }}
          >
            <h3 className="text-[16px] font-semibold mb-1.5">Override existing data?</h3>
            <p className="text-[14px] mb-5" style={{ color: 'var(--assistant-text-soft)' }}>
              This will permanently replace all your current lists, habits, reminders and checklists with the contents of the imported file.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOverride(false)}
                className={`flex-1 rounded-lg px-3.5 py-2.5 text-[14px] font-medium transition-colors ${classes.panelBtn}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmOverrideImport}
                className="flex-1 rounded-lg px-3.5 py-2.5 text-[14px] font-medium transition-colors"
                style={{ background: '#f87171', color: '#1a0505' }}
              >
                Override
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center p-5">
          <button
            type="button"
            className="fixed inset-0"
            style={{ background: 'var(--assistant-overlay)' }}
            onClick={closeDeleteConfirm}
            aria-label="Cancel"
          />
          <form
            role="alertdialog"
            aria-labelledby="delete-all-title"
            onSubmit={e => { e.preventDefault(); void handleDeleteAll(); }}
            className="relative z-10 w-full max-w-[380px] rounded-2xl p-5 shadow-2xl"
            style={{
              background: 'var(--assistant-bg)',
              color: 'var(--assistant-text)',
              border: '1px solid var(--assistant-border-soft)',
            }}
          >
            <h3 id="delete-all-title" className="text-[16px] font-semibold mb-1.5">Delete all data?</h3>
            <p className="text-[14px] mb-4" style={{ color: 'var(--assistant-text-soft)' }}>
              Every list, task, habit, reminder and checklist will be permanently deleted from this device and the server.
              Consider exporting a backup first.
            </p>
            <label htmlFor="delete-all-confirm" className="block text-[13px] mb-1.5" style={{ color: 'var(--assistant-text-muted)' }}>
              Type <span className="font-semibold" style={{ color: 'var(--assistant-text)' }}>{DELETE_CONFIRM_WORD}</span> to confirm
            </label>
            <input
              id="delete-all-confirm"
              autoFocus
              autoComplete="off"
              value={deleteWord}
              onChange={e => setDeleteWord(e.target.value)}
              disabled={deleting}
              className={`w-full rounded-lg px-3 py-2 text-[14px] ${classes.panelInput}`}
            />
            {deleteError ? (
              <div className="mt-3 text-[13px]" style={{ color: 'var(--assistant-danger-text)' }}>{deleteError}</div>
            ) : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleting}
                className={`flex-1 rounded-lg px-3.5 py-2.5 text-[14px] font-medium transition-colors ${classes.panelBtn}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleteWord !== DELETE_CONFIRM_WORD || deleting}
                className="flex-1 rounded-lg px-3.5 py-2.5 text-[14px] font-medium transition-opacity disabled:opacity-40"
                style={{ background: '#dc2626', color: '#ffffff' }}
              >
                {deleting ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
