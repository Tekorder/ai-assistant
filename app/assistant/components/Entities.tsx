// app/components/entities.tsx
'use client';

import React from 'react';
import nlp from 'compromise';

type Block = {
  id: string;
  text: string;
  indent: number; // 0 = title, 1+ = task/subtask
  checked?: boolean;
  deadline?: string; // YYYY-MM-DD
  isHidden?: boolean;
  archived?: boolean;
};

type Project = {
  project_id: string;
  title: string;
  blocks: Block[];
  collapsed?: Record<string, boolean>;
};

type ProjectsPayload = {
  projects: Project[];
  selectedProjectId?: string;
};

type EntityKind = 'person' | 'place';

type EntityCandidate = {
  kind: EntityKind;
  label: string; // "Juan", "Tegucigalpa"
  count: number;
  examples: Array<{
    blockId: string;
    text: string;
    projectTitle: string;
    sectionTitle: string;
  }>;
};

const LS_KEY_V2 = 'youtask_projects_v1';

function normEntity(s: string) {
  return (s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[“”"'.:,;!?()]/g, '')
    .toLowerCase();
}

function isProbablyGarbageEntity(raw: string) {
  const s = (raw || '').trim();
  if (!s) return true;
  if (s.length < 2) return true;
  if (s.length > 40) return true;
  if (/^\d+$/.test(s)) return true;
  if (/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/.test(s)) return true;

  const k = normEntity(s);

  // super-common UI/tech words we NEVER want as entities
  const STOP = new Set([
    'completed',
    'overdue',
    'quickview',
    'projects',
    'project',
    'view',
    'views',
    'today',
    'week',
    'day',
    'tree',
    'modal',
    'branch',
    'pill',
    'emoji',
    'habits',
    'reminders',
    'sidebar',
    'content',
    'create',
    'film',
    'practice',
    'script',
    'default',
    'fallbacks',
    'uncategorized',
    'personal',
    'app',
    'tasks',
    'ios',
    'android',
  ]);

  if (STOP.has(k)) return true;

  // if it's just "the" / "and" / etc.
  const COMMON = new Set(['and', 'or', 'the', 'a', 'an', 'to', 'with', 'for', 'de', 'la', 'el', 'y', 'o', 'en', 'a', 'para', 'con']);
  if (COMMON.has(k)) return true;

  return false;
}

function dedupeByNorm(arr: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const k = normEntity(x);
    if (!k || seen.has(k)) continue;
    if (isProbablyGarbageEntity(x)) continue;
    seen.add(k);
    out.push(x.trim());
  }
  return out;
}

/* ---------- ES heuristics (STRICT) ---------- */
function detectPlacesByPrepositionES(text: string): string[] {
  // en Tegucigalpa, a Miami, para San Pedro Sula
  const re =
    /\b(en|para|a)\s+([A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ''))) out.push(m[2]);
  return out;
}

function detectPeopleByConES(text: string): string[] {
  // con Juan, con Maria Fernanda
  const re =
    /\b(con)\s+([A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ''))) out.push(m[2]);
  return out;
}

function extractPeoplePlacesStrict(text: string): { people: string[]; places: string[] } {
  const doc = nlp(text || '');

  const people1 = (doc.people().out('array') as string[]) ?? [];
  const places1 = (doc.places().out('array') as string[]) ?? [];

  const people2 = detectPeopleByConES(text);
  const places2 = detectPlacesByPrepositionES(text);

  const people = dedupeByNorm([...people1, ...people2]);
  const places = dedupeByNorm([...places1, ...places2]);

  // avoid duplicates between categories
  const placeNorm = new Set(places.map(normEntity));
  const peopleClean = people.filter(p => !placeNorm.has(normEntity(p)));

  return { people: peopleClean, places };
}

function readProjectsFromLS(): ProjectsPayload | null {
  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.projects)) return null;
    return parsed as ProjectsPayload;
  } catch {
    return null;
  }
}

function buildEntityCandidates(payload: ProjectsPayload): EntityCandidate[] {
  const map = new Map<string, EntityCandidate>();

  for (const proj of payload.projects || []) {
    const projectTitle = (proj?.title || 'Untitled').trim() || 'Untitled';
    const blocks = Array.isArray(proj?.blocks) ? proj.blocks : [];
    let sectionTitle = 'Uncategorized';

    for (const b of blocks) {
      const indent = Number.isFinite(b?.indent) ? Number(b.indent) : 0;

      if (indent === 0) {
        sectionTitle = (b?.text || '').trim() || 'Uncategorized';
        continue;
      }

      const text = (b?.text || '').trim();
      if (!text) continue;

      const { people, places } = extractPeoplePlacesStrict(text);

      const bump = (kind: EntityKind, label: string) => {
        const key = `${kind}:${normEntity(label)}`;
        const row =
          map.get(key) ??
          ({
            kind,
            label: label.trim(),
            count: 0,
            examples: [],
          } as EntityCandidate);

        row.count += 1;

        if (row.examples.length < 4) {
          row.examples.push({
            blockId: String(b?.id ?? ''),
            text,
            projectTitle,
            sectionTitle,
          });
        }

        map.set(key, row);
      };

      for (const p of people) bump('person', p);
      for (const p of places) bump('place', p);
    }
  }

  const out = Array.from(map.values());

  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'person' ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });

  return out;
}

export default function Entities({
  className,
  onPick,
}: {
  className?: string;
  onPick?: (kind: EntityKind, label: string) => void;
}) {
  const [items, setItems] = React.useState<EntityCandidate[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const load = () => {
      const payload = readProjectsFromLS();
      if (!payload) {
        setItems([]);
        setLoaded(true);
        return;
      }
      setItems(buildEntityCandidates(payload));
      setLoaded(true);
    };

    load();

    const onCustom = () => load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_V2) load();
    };

    window.addEventListener('youtask_projects_updated', onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_projects_updated', onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return (
    <div className={className ?? ''}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-white/85 font-semibold">Entities</div>
        <div className="text-[11px] text-white/40">{loaded ? `${items.length}` : 'Loading…'}</div>
      </div>

      {!loaded ? (
        <div className="text-[12px] text-white/45">Loading…</div>
      ) : !items.length ? (
        <div className="text-[12px] text-white/45">No people or places found yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((e) => {
            const key = `${e.kind}:${normEntity(e.label)}`;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPick?.(e.kind, e.label)}
                className={[
                  'w-full text-left rounded-xl bg-white/8',
                  'px-3 py-3 hover:bg-white/12 transition-colors',
                ].join(' ')}
                title={e.examples.map(x => `${x.projectTitle} · ${x.sectionTitle}`).join('\n')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] text-white/85 font-semibold truncate">
                      {e.label}
                    </div>
                    <div className="text-[11px] text-white/45">
                      {e.kind === 'person' ? 'Person' : 'Place'} · {e.count} task{e.count === 1 ? '' : 's'}
                    </div>
                  </div>

                  <span
                    className={[
                      'shrink-0 text-[11px] px-2 py-1 rounded-full',
                      e.kind === 'person'
                        ? 'text-emerald-200 bg-emerald-500/16'
                        : 'text-sky-200 bg-sky-500/14',
                    ].join(' ')}
                  >
                    {e.kind === 'person' ? '👤' : '📍'}
                  </span>
                </div>

                {e.examples.length ? (
                  <div className="mt-2 space-y-1">
                    {e.examples.map((x) => (
                      <div key={x.blockId} className="text-[11px] text-white/45 truncate">
                        {x.text}
                      </div>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}