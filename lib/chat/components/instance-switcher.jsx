'use client';

import { useState, useEffect } from 'react';
import { GlobeIcon } from './icons.js';
import { getInstanceRegistryAction } from '../actions.js';

/**
 * Instance switcher dropdown for superadmin users.
 * Only renders when isSuperadminHub prop is true.
 *
 * @param {{ isSuperadminHub: boolean }} props
 */
export function InstanceSwitcher({ isSuperadminHub }) {
  const [instances, setInstances] = useState([]);
  const [activeInstance, setActiveInstance] = useState(null);

  useEffect(() => {
    if (!isSuperadminHub) return;

    getInstanceRegistryAction()
      .then((result) => {
        if (result.instances) {
          setInstances(result.instances);
          // Default to local instance or localStorage preference
          const saved = localStorage.getItem('clawforge-active-instance');
          const match = result.instances.find((i) => i.name === saved);
          setActiveInstance(match ? match.name : result.instances[0]?.name || null);
        }
      })
      .catch(() => {});
  }, [isSuperadminHub]);

  if (!isSuperadminHub || instances.length === 0) return null;

  function handleChange(e) {
    const name = e.target.value;
    setActiveInstance(name);
    localStorage.setItem('clawforge-active-instance', name);

    // If not the local instance, open in new tab (simple MVP)
    const inst = instances.find((i) => i.name === name);
    if (inst && !inst.isLocal) {
      // For remote instances, the URL would come from config
      // For now, just store the selection
    }
  }

  return (
    <div className="mb-3 px-1">
      <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1">
        <GlobeIcon size={12} />
        Agent
      </label>
      <select
        value={activeInstance || ''}
        onChange={handleChange}
        className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
      >
        {instances.map((inst) => (
          <option key={inst.name} value={inst.name}>
            {inst.name} {inst.isLocal ? '(local)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
