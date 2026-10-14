// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  LogOut,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { initials, type Item, type User } from './api';

type Preferences = { width: number; collapsed: boolean; hidden: string[]; order: string[] };
const defaults: Preferences = { width: 232, collapsed: false, hidden: [], order: [] };
export function WorkspaceSidebar({
  sections,
  user,
  organisation,
  page,
  mobile,
  navigate,
  onAi,
  onLogout,
}: {
  sections: { label: string; items: any[][] }[];
  user: User;
  organisation: Item;
  page: string;
  mobile: boolean;
  navigate: (id: string) => void;
  onAi: () => void;
  onLogout: () => void;
}) {
  const key = 'reverse-navigation-' + user.id;
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try {
      const p = JSON.parse(localStorage.getItem(key) || 'null');
      if (p && Array.isArray(p.hidden) && Array.isArray(p.order))
        return {
          width: Math.max(200, Math.min(340, Number(p.width) || 232)),
          collapsed: !!p.collapsed,
          hidden: p.hidden.filter((x: any) => typeof x === 'string'),
          order: p.order.filter((x: any) => typeof x === 'string'),
        };
    } catch {}
    return { ...defaults };
  });
  const [editing, setEditing] = useState(false),
    [dragged, setDragged] = useState('');
  const start = useRef<{ x: number; width: number } | null>(null);
  const items = sections
    .flatMap((section) => section.items)
    .filter(
      ([id]) =>
        !['admin', 'reports', 'billing'].includes(id) || ['admin', 'manager'].includes(user.role),
    );
  const order = items
    .map(([id]) => id)
    .sort((a, b) => {
      const rank = (id: string) =>
        preferences.order.includes(id)
          ? preferences.order.indexOf(id)
          : 1000 + items.findIndex(([key]) => key === id);
      return rank(a) - rank(b);
    });
  const update = (patch: Partial<Preferences>) =>
    setPreferences((current) => ({ ...current, ...patch }));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(preferences));
    } catch {}
    document.documentElement.style.setProperty(
      '--navigation-width',
      (preferences.collapsed ? 72 : preferences.width) + 'px',
    );
    return () => {
      document.documentElement.style.removeProperty('--navigation-width');
    };
  }, [preferences, key]);
  function reorder(id: string, target: string) {
    if (id === target || !order.includes(id) || !order.includes(target)) return;
    const result = order.filter((x) => x !== id);
    result.splice(result.indexOf(target), 0, id);
    update({ order: result });
  }
  function move(id: string, step: number) {
    const index = order.indexOf(id),
      target = index + step;
    if (target < 0 || target >= order.length) return;
    const result = [...order];
    [result[index], result[target]] = [result[target], result[index]];
    update({ order: result });
  }
  return (
    <aside
      className={`sidebar configurable-sidebar ${mobile ? 'mobile-open' : ''} ${preferences.collapsed ? 'is-collapsed' : ''}`}
    >
      <a
        className="brand"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          navigate('home');
        }}
      >
        <div className="brand-mark">
          r<span>o</span>
          <i />
        </div>
        <div className="sidebar-label">
          reverse<span>office</span>
        </div>
      </a>
      <div className="sidebar-controls">
        <button
          className="icon-button"
          aria-label={preferences.collapsed ? 'Expand navigation' : 'Collapse navigation'}
          onClick={() => update({ collapsed: !preferences.collapsed })}
        >
          {preferences.collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
        </button>
        <button
          className="icon-button"
          aria-label="Customize navigation"
          onClick={() => setEditing(!editing)}
        >
          <Settings2 size={17} />
        </button>
      </div>
      <div className="workspace-switch sidebar-label">
        <span className="workspace-monogram">W</span>
        <div>
          <strong>{organisation.name || 'My workspace'}</strong>
          <small>{organisation.timezone || 'Private workspace'}</small>
        </div>
      </div>
      <nav aria-label="Workspace navigation">
        {order
          .filter((id) => !preferences.hidden.includes(id))
          .map((id) => {
            const [, label, Icon] = items.find(([key]) => key === id)!;
            return (
              <button
                key={id}
                aria-label={label}
                title={label}
                className={page === id ? 'active' : ''}
                onClick={() => navigate(id)}
                draggable
                onDragStart={() => setDragged(id)}
                onDragEnd={() => setDragged('')}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  reorder(dragged, id);
                  setDragged('');
                }}
              >
                <Icon size={18} />
                <span className="sidebar-label">{label}</span>
              </button>
            );
          })}
      </nav>
      <button className="sidebar-ai" onClick={onAi} title="Nova AI">
        <Sparkles size={19} />
        <div className="sidebar-label">
          <strong>A little momentum</strong>
          <small>Ask your workspace assistant ↗</small>
        </div>
      </button>
      <div className="sidebar-user">
        <span className="avatar">{initials(user.name)}</span>
        <div className="sidebar-label">
          <strong>{user.name}</strong>
          <small>{user.role}</small>
        </div>
        <button className="icon-button" aria-label="Sign out" onClick={onLogout}>
          <LogOut size={15} />
        </button>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize navigation"
        aria-valuemin={72}
        aria-valuemax={340}
        aria-valuenow={preferences.collapsed ? 72 : preferences.width}
        tabIndex={0}
        className="sidebar-resizer"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = { x: e.clientX, width: preferences.collapsed ? 72 : preferences.width };
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const width = start.current.width + e.clientX - start.current.x;
          update({ collapsed: width < 150, width: Math.max(200, Math.min(340, width)) });
        }}
        onPointerUp={() => {
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
        onLostPointerCapture={() => {
          start.current = null;
        }}
        onKeyDown={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) {
            e.preventDefault();
            if (e.key === 'Home') update(defaults);
            else {
              const width =
                (preferences.collapsed ? 140 : preferences.width) +
                (e.key === 'ArrowRight' ? 24 : -24);
              update({ collapsed: width < 160, width: Math.max(200, Math.min(340, width)) });
            }
          }
        }}
      />
      {editing && (
        <div className="navigation-editor" role="dialog" aria-label="Customize navigation">
          <header>
            <strong>Your shortcuts</strong>
            <button
              className="icon-button"
              aria-label="Close navigation settings"
              onClick={() => setEditing(false)}
            >
              <X size={16} />
            </button>
          </header>
          <p>Drag shortcuts to reorder. Hide or restore any module.</p>
          <div className="shortcut-list">
            {order.map((id) => {
              const [, label] = items.find(([key]) => key === id)!;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={() => setDragged(id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    reorder(dragged, id);
                  }}
                >
                  <GripVertical size={14} />
                  <label>
                    <input
                      type="checkbox"
                      checked={!preferences.hidden.includes(id)}
                      onChange={(e) =>
                        update({
                          hidden: e.target.checked
                            ? preferences.hidden.filter((x) => x !== id)
                            : [...preferences.hidden, id],
                        })
                      }
                    />
                    {label}
                  </label>
                  <button
                    className="icon-button"
                    aria-label={'Move ' + label + ' up'}
                    disabled={order.indexOf(id) === 0}
                    onClick={() => move(id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="icon-button"
                    aria-label={'Move ' + label + ' down'}
                    disabled={order.indexOf(id) === order.length - 1}
                    onClick={() => move(id, 1)}
                  >
                    ↓
                  </button>
                </div>
              );
            })}
          </div>
          <button className="button" onClick={() => update({ ...defaults })}>
            Restore default navigation
          </button>
        </div>
      )}
    </aside>
  );
}
