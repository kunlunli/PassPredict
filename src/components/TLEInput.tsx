'use client';

import { useCallback, useState } from 'react';
import { TLEEntry } from '@/lib/types';
import { PASS_COLORS } from '@/lib/passPredict';

interface Props {
  entries: TLEEntry[];
  onChange: (entries: TLEEntry[]) => void;
}

// ── TLE file parser ──────────────────────────────────────────────────────────
// Handles 2-line and 3-line (with name) formats, single or multi-satellite.
function parseTLEText(text: string): Array<{ name: string; line1: string; line2: string }> {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const results: Array<{ name: string; line1: string; line2: string }> = [];
  let i = 0;

  while (i < lines.length) {
    const a = lines[i];
    const b = lines[i + 1];
    const c = lines[i + 2];

    // 3-line: name, line1, line2
    if (!a.startsWith('1 ') && !a.startsWith('2 ') && b?.startsWith('1 ') && c?.startsWith('2 ')) {
      results.push({ name: a, line1: b, line2: c });
      i += 3;
      continue;
    }

    // 2-line: line1, line2 (no name)
    if (a.startsWith('1 ') && b?.startsWith('2 ')) {
      const catNum = a.substring(2, 7).trim();
      results.push({ name: `SAT ${catNum}`, line1: a, line2: b });
      i += 2;
      continue;
    }

    i++;
  }

  return results;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ── Upload drop zone ─────────────────────────────────────────────────────────
function UploadZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.name.endsWith('.txt') || f.name.endsWith('.tle')
    );
    if (files.length) onFiles(files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFiles(files);
    e.target.value = ''; // allow re-uploading same file
  };

  return (
    <label
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragEnter={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed cursor-pointer select-none transition-colors ${
        dragging
          ? 'border-blue-400 bg-blue-900/20 text-blue-300'
          : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/30 text-gray-400'
      }`}
    >
      <input type="file" accept=".txt,.tle" multiple onChange={handleChange} className="sr-only" />
      <svg
        className="w-8 h-8 opacity-60"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
      <div className="text-center">
        <p className="text-sm font-medium">
          {dragging ? 'Drop to load' : 'Drop TLE file here'}
        </p>
        <p className="text-xs mt-0.5 text-gray-600">
          or click to browse &nbsp;·&nbsp; .txt or .tle &nbsp;·&nbsp; one or multiple files
        </p>
      </div>
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function TLEInput({ entries, onChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualText, setManualText] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function flash(text: string, ok = true) {
    setStatusMsg({ text, ok });
    setTimeout(() => setStatusMsg(null), 4000);
  }

  // Parse one or more uploaded files and append to entries
  const handleFiles = useCallback(
    async (files: File[]) => {
      try {
        const texts = await Promise.all(files.map(readFile));
        const newEntries: TLEEntry[] = [];

        texts.forEach((text, fi) => {
          const parsed = parseTLEText(text);
          if (parsed.length === 0) {
            flash(`No valid TLE found in "${files[fi].name}"`, false);
            return;
          }
          parsed.forEach(p =>
            newEntries.push({
              id: crypto.randomUUID(),
              name: p.name,
              text: `${p.name}\n${p.line1}\n${p.line2}`,
            })
          );
        });

        if (newEntries.length > 0) {
          onChange([...entries, ...newEntries]);
          flash(
            `${newEntries.length} satellite${newEntries.length > 1 ? 's' : ''} loaded` +
              (files.length > 1 ? ` from ${files.length} files` : ` from "${files[0].name}"`)
          );
        }
      } catch {
        flash('Failed to read file', false);
      }
    },
    [entries, onChange]
  );

  function addManual() {
    const parsed = parseTLEText(manualText);
    if (parsed.length === 0) {
      flash('No valid TLE detected in the pasted text.', false);
      return;
    }
    const newEntries: TLEEntry[] = parsed.map(p => ({
      id: crypto.randomUUID(),
      name: p.name,
      text: `${p.name}\n${p.line1}\n${p.line2}`,
    }));
    onChange([...entries, ...newEntries]);
    setManualText('');
    setShowManual(false);
    flash(`${newEntries.length} satellite${newEntries.length > 1 ? 's' : ''} added`);
  }

  function remove(id: string) {
    onChange(entries.filter(e => e.id !== id));
  }

  function updateEntry(id: string, patch: Partial<TLEEntry>) {
    onChange(entries.map(e => (e.id === id ? { ...e, ...patch } : e)));
  }

  function clearAll() {
    onChange([]);
    setExpandedId(null);
  }

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          TLE Data
          {entries.length > 0 && (
            <span className="ml-2 text-blue-400 normal-case font-normal">
              {entries.length} sat{entries.length > 1 ? 's' : ''}
            </span>
          )}
        </h2>
        {entries.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Primary: file upload ── */}
      <UploadZone onFiles={handleFiles} />

      {/* Upload status */}
      {statusMsg && (
        <p
          className={`text-xs text-center ${
            statusMsg.ok ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {statusMsg.ok ? '✓ ' : '✗ '}
          {statusMsg.text}
        </p>
      )}

      {/* ── Satellite list ── */}
      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((entry, i) => (
            <div
              key={entry.id}
              className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden"
            >
              {/* Row header */}
              <div className="flex items-center gap-2 px-3 py-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PASS_COLORS[i % PASS_COLORS.length] }}
                />
                <input
                  type="text"
                  value={entry.name}
                  onChange={e => updateEntry(entry.id, { name: e.target.value })}
                  className="flex-1 min-w-0 bg-transparent text-white text-xs font-medium focus:outline-none truncate"
                />
                <button
                  onClick={() =>
                    setExpandedId(expandedId === entry.id ? null : entry.id)
                  }
                  title="View / edit TLE"
                  className="text-gray-600 hover:text-gray-300 text-xs px-1 transition-colors leading-none"
                >
                  {expandedId === entry.id ? '▲' : '▼'}
                </button>
                <button
                  onClick={() => remove(entry.id)}
                  title="Remove"
                  className="text-gray-600 hover:text-red-400 text-xs px-1 transition-colors leading-none"
                >
                  ✕
                </button>
              </div>

              {/* Expandable TLE text editor */}
              {expandedId === entry.id && (
                <div className="border-t border-gray-700 px-3 pt-2 pb-3">
                  <textarea
                    value={entry.text}
                    onChange={e => updateEntry(entry.id, { text: e.target.value })}
                    rows={4}
                    spellCheck={false}
                    className="w-full bg-gray-950 text-green-400 text-xs font-mono rounded px-2 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Secondary: manual text entry ── */}
      <div className="pt-1">
        <button
          onClick={() => setShowManual(v => !v)}
          className="text-xs text-gray-600 hover:text-gray-300 transition-colors flex items-center gap-1"
        >
          <span className="text-gray-700">{showManual ? '▼' : '▶'}</span>
          Enter TLE manually
        </button>

        {showManual && (
          <div className="mt-2 space-y-2">
            <textarea
              placeholder={
                'Paste TLE text (2 or 3 lines per satellite):\n\nCOMS 1\n1 36744U 10032A ...\n2 36744 ...'
              }
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              rows={6}
              spellCheck={false}
              className="w-full bg-gray-950 text-green-400 text-xs font-mono rounded px-2 py-2 placeholder-gray-700 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowManual(false);
                  setManualText('');
                }}
                className="text-xs text-gray-600 hover:text-gray-300 px-2 py-1 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addManual}
                disabled={!manualText.trim()}
                className="text-xs px-3 py-1 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
