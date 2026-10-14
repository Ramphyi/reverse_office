// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowRight, BookOpen, Check, Search, RotateCcw } from 'lucide-react';
import { guideTopics, words, type Language, type Words } from './guide-content';

export function useGuideLanguage() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem('ro-guide-language') === 'en' ? 'en' : 'ro';
    } catch {
      return 'ro';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('ro-guide-language', language);
    } catch {}
  }, [language]);
  return { language, setLanguage };
}
export function GuideLanguage({
  language,
  setLanguage,
}: {
  language: Language;
  setLanguage: (v: Language) => void;
}) {
  return (
    <div className="guide-language" role="group" aria-label="Guide language">
      {(['ro', 'en'] as const).map((v) => (
        <button key={v} lang={v} aria-pressed={language === v} onClick={() => setLanguage(v)}>
          {v.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
const categories: { id: string; name: Words }[] = [
  { id: 'all', name: ['Toate', 'All'] },
  { id: 'start', name: ['Primii pași', 'Getting started'] },
  { id: 'create', name: ['Creează', 'Create'] },
  { id: 'team', name: ['Colaborează', 'Collaborate'] },
  { id: 'manage', name: ['Organizează', 'Manage'] },
];
const normalize = (v: string) =>
  v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
export function ProductGuide({
  userId = 'visitor',
  role,
  spv = false,
  onNavigate,
  languageControl,
}: {
  userId?: string;
  role?: string;
  spv?: boolean;
  onNavigate?: (app: string) => void;
  languageControl?: { language: Language; setLanguage: (v: Language) => void };
}) {
  const ownLanguage = useGuideLanguage();
  const { language, setLanguage } = languageControl || ownLanguage,
    t = (v: Words) => words(v, language);
  const storageKey = 'ro-guide-progress-v1:' + userId;
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('all');
  const [selected, setSelected] = useState(
    () => new URLSearchParams(location.search).get('topic') || 'start',
  );
  const [storageError, setStorageError] = useState(false);
  const [completed, setCompleted] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(saved) ? saved.filter((x) => typeof x === 'string').slice(0, 100) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(completed));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [completed, storageKey]);
  const results = guideTopics.filter(
    (topic) =>
      (category === 'all' || topic.category === category) &&
      normalize(topic.title + ' ' + t(topic.summary) + ' ' + topic.steps.map(t).join(' ')).includes(
        normalize(query.trim()),
      ),
  );
  const active = results.find((v) => v.id === selected) || results[0];
  const stepIds = guideTopics.flatMap((topic) => topic.steps.map((_, i) => `${topic.id}:${i}`));
  const count = stepIds.filter((id) => completed.includes(id)).length;
  const choose = (id: string) => {
    setSelected(id);
    const url = new URL(location.href);
    url.searchParams.set('topic', id);
    history.replaceState(null, '', url);
  };
  const restricted = active?.roles && role && !active.roles.includes(role);
  const optional = active?.optional && !spv;
  return (
    <section
      className="product-guide"
      lang={language}
      aria-label={t(['Ghid Reverse Office', 'Reverse Office guide'])}
    >
      <div className="guide-intro">
        <div>
          <span className="guide-eyebrow">
            <BookOpen size={15} /> REVERSE OFFICE / FIELD GUIDE
          </span>
          <h2>
            {t([
              'Un loc pentru muncă. Un ghid pentru tot.',
              'One place to work. A guide to it all.',
            ])}
          </h2>
          <p>
            {t([
              'Alege un modul, urmează pașii și încearcă în spațiul tău. Poți reveni oricând.',
              'Choose a module, follow the steps and try it in your workspace. Come back anytime.',
            ])}
          </p>
        </div>
        <div className="guide-intro-links">
          <GuideLanguage language={language} setLanguage={setLanguage} />
          {onNavigate && (
            <a href="/welcome" target="_blank" rel="noopener noreferrer">
              {t(['Despre proiect', 'About the project'])}
              <ArrowUpRight size={13} />
            </a>
          )}
        </div>
      </div>
      <div className="guide-progress">
        <div>
          <strong>
            {count} / {stepIds.length} {t(['pași parcurși', 'steps checked'])}
          </strong>
          <span>
            {storageError
              ? t([
                  'Browserul nu poate salva progresul; rămâne disponibil doar acum.',
                  'Your browser cannot save progress; it is available for this visit only.',
                ])
              : t([
                  'Bifele sunt notițele tale, salvate în acest browser. Nu modifică datele aplicației.',
                  'Checks are your notes, saved in this browser. They do not change app data.',
                ])}
          </span>
        </div>
        <progress
          aria-label={t(['Progres tutorial', 'Tutorial progress'])}
          max={stepIds.length}
          value={count}
        />
        <button onClick={() => setCompleted([])} disabled={!count}>
          <RotateCcw size={14} /> {t(['Resetează', 'Reset'])}
        </button>
      </div>
      <div className="guide-filters">
        <label className="guide-search">
          <Search size={17} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t(['Caută în ghid', 'Search the guide'])}
            placeholder={t(['Caută: formule, concediu, email…', 'Search: formulas, leave, email…'])}
          />
        </label>
        <div role="group" aria-label={t(['Categorii tutorial', 'Tutorial categories'])}>
          {categories.map((c) => (
            <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
              {t(c.name)}
            </button>
          ))}
        </div>
      </div>
      <div className="guide-layout">
        <nav aria-label={t(['Capitole tutorial', 'Tutorial chapters'])}>
          <p>
            {results.length} {t(['capitole', 'chapters'])}
          </p>
          {results.map((topic) => (
            <button
              key={topic.id}
              aria-current={active?.id === topic.id ? 'page' : undefined}
              onClick={() => choose(topic.id)}
            >
              <span>
                {topic.title}
                <small>{t(topic.summary)}</small>
              </span>
              {topic.steps.every((_, i) => completed.includes(`${topic.id}:${i}`)) ? (
                <Check size={17} aria-label={t(['Parcurs', 'Checked'])} />
              ) : (
                <ArrowUpRight size={16} />
              )}
            </button>
          ))}
        </nav>
        {active ? (
          <article className="guide-chapter" key={active.id}>
            <span className="guide-eyebrow">
              {t(categories.find((c) => c.id === active.category)!.name)}{' '}
              {active.optional ? ' / EXTENSION' : ''}
            </span>
            <h3>{active.title}</h3>
            <p className="guide-lead">{t(active.summary)}</p>
            <ol className="guide-steps">
              {active.steps.map((step, i) => {
                const id = `${active.id}:${i}`;
                return (
                  <li key={id} className={completed.includes(id) ? 'is-complete' : ''}>
                    <span className="guide-step-number">{String(i + 1).padStart(2, '0')}</span>
                    <label>
                      <input
                        type="checkbox"
                        checked={completed.includes(id)}
                        onChange={(e) =>
                          setCompleted((old) =>
                            e.target.checked
                              ? [...new Set([...old, id])]
                              : old.filter((v) => v !== id),
                          )
                        }
                      />
                      <span>{t(step)}</span>
                    </label>
                  </li>
                );
              })}
            </ol>
            <aside className="guide-note">
              <strong>{t(['De reținut', 'Keep in mind'])}</strong>
              <p>{t(active.note)}</p>
            </aside>
            <div className="guide-chapter-actions">
              {restricted ? (
                <span>
                  {t([
                    'Deschiderea acestui modul necesită rolul indicat: ',
                    'Opening this module requires: ',
                  ])}
                  {active.roles!.join(' / ')}
                </span>
              ) : optional ? (
                <span>
                  {t([
                    'Disponibil separat în feature/romania-spv.',
                    'Available separately in feature/romania-spv.',
                  ])}
                </span>
              ) : onNavigate ? (
                <button className="guide-primary" onClick={() => onNavigate(active.app)}>
                  {t(['Încearcă în aplicație', 'Try it in the app'])}
                  <ArrowUpRight size={17} />
                </button>
              ) : (
                <a
                  className="guide-primary"
                  href={
                    active.app === 'nova'
                      ? '/?app=guide&topic=nova'
                      : `/?app=${encodeURIComponent(active.app)}`
                  }
                >
                  {t(['Deschide spațiul de lucru', 'Open workspace'])}
                  <ArrowUpRight size={17} />
                </a>
              )}
              {results.indexOf(active) < results.length - 1 && (
                <button
                  onClick={() => {
                    choose(results[results.indexOf(active) + 1].id);
                    document
                      .querySelector('.guide-chapter')
                      ?.scrollIntoView({
                        block: 'nearest',
                        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                          ? 'auto'
                          : 'smooth',
                      });
                  }}
                >
                  {t(['Capitolul următor', 'Next chapter'])}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
            <p className="guide-context">
              {t([
                'Pașii sunt orientativi; butoanele modulelor păstrează denumirile din interfață. Drepturile contului sunt verificate de aplicație.',
                'Steps retain the module interface’s button names. Account permissions are enforced by the application.',
              ])}
            </p>
          </article>
        ) : (
          <div className="guide-no-results" role="status">
            <h3>{t(['Niciun capitol găsit', 'No chapters found'])}</h3>
            <p>
              {t([
                'Încearcă un termen mai scurt sau elimină filtrul.',
                'Try a shorter term or remove the filter.',
              ])}
            </p>
            <button
              className="guide-primary"
              onClick={() => {
                setQuery('');
                setCategory('all');
              }}
            >
              {t(['Arată toate capitolele', 'Show all chapters'])}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
