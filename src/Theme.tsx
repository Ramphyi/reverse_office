import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
export function useTheme() {
  const [choice, setChoice] = useState(() => localStorage.getItem('ro-theme') || 'system'),
    [system, setSystem] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)'),
      change = () => setSystem(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const theme = choice === 'system' ? (system ? 'dark' : 'light') : choice;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('ro-theme', choice);
  }, [choice, theme]);
  return { theme, choice, setChoice };
}
export function ThemePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const Icon = value === 'dark' ? Moon : value === 'light' ? Sun : Monitor;
  return (
    <label className="theme-picker" title="Appearance">
      <Icon size={16} />
      <select aria-label="Color theme" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
