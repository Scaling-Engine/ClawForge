'use client';
import { createContext, useContext, useState } from 'react';

const RepoChatContext = createContext(null);

/**
 * Provider that holds the currently-selected repo and branch for a chat session.
 * State is in-memory only — clears on page reload (correct for an operator tool).
 */
export function RepoChatProvider({ children }) {
  const [selectedRepo, setSelectedRepo] = useState(null);    // { owner, slug, name }
  const [selectedBranch, setSelectedBranch] = useState(null); // string e.g. "main"

  return (
    <RepoChatContext.Provider value={{ selectedRepo, setSelectedRepo, selectedBranch, setSelectedBranch }}>
      {children}
    </RepoChatContext.Provider>
  );
}

/**
 * Returns { selectedRepo, setSelectedRepo, selectedBranch, setSelectedBranch }.
 * selectedRepo shape: { owner: string, slug: string, name: string } | null
 */
export function useRepoChat() {
  const ctx = useContext(RepoChatContext);
  if (!ctx) {
    return { selectedRepo: null, setSelectedRepo: () => {}, selectedBranch: null, setSelectedBranch: () => {} };
  }
  return ctx;
}
