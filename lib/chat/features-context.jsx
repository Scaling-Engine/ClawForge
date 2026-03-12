'use client';
import { createContext, useContext } from 'react';

const FeaturesContext = createContext({});

/**
 * Provider that receives pre-loaded feature flags and exposes them to children.
 * Load flags server-side and pass as the `flags` prop.
 *
 * @param {{ flags: Record<string, boolean>, children: React.ReactNode }} props
 */
export function FeaturesProvider({ flags = {}, children }) {
  return <FeaturesContext.Provider value={flags}>{children}</FeaturesContext.Provider>;
}

/**
 * Returns true if the named feature flag is enabled.
 * Returns false if flag is absent or FeaturesProvider is not mounted.
 *
 * @param {string} flag
 * @returns {boolean}
 */
export function useFeature(flag) {
  const flags = useContext(FeaturesContext);
  return Boolean(flags[flag]);
}
