'use client';

import { useEffect, useState, useRef } from 'react';
import { SidebarTrigger } from './ui/sidebar.js';
import { useRepoChat } from '../repo-chat-context.js';
import { getRepos, getBranches, getAgentName } from '../actions.js';

export function ChatHeader({ chatId }) {
  const { selectedRepo, setSelectedRepo, selectedBranch, setSelectedBranch } = useRepoChat();
  const [repos, setRepos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const branchLoadingForRepo = useRef(null);
  const [agentName, setAgentName] = useState('');

  useEffect(() => {
    getRepos().then(setRepos).catch(() => setRepos([]));
    getAgentName().then(setAgentName).catch(() => {});
  }, []);

  const handleRepoChange = async (e) => {
    const slug = e.target.value;
    if (!slug) {
      setSelectedRepo(null);
      setSelectedBranch(null);
      setBranches([]);
      return;
    }
    const repo = repos.find((r) => r.slug === slug);
    if (!repo) return;
    setSelectedRepo(repo);
    setSelectedBranch(null);
    setBranches([]);
    setLoadingBranches(true);
    branchLoadingForRepo.current = slug;
    const result = await getBranches(repo.owner, repo.slug);
    if (branchLoadingForRepo.current === slug) {
      setBranches(result);
      setLoadingBranches(false);
    }
  };

  const handleBranchChange = (e) => {
    setSelectedBranch(e.target.value || null);
  };

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2 z-10 border-b border-border">
      {/* Mobile-only: open sidebar sheet */}
      <div className="md:hidden">
        <SidebarTrigger />
      </div>
      {agentName && (
        <span className="hidden md:inline text-sm font-medium text-foreground">{agentName}</span>
      )}
      <div className="flex flex-1 items-center gap-2">
        <select
          value={selectedRepo?.slug || ''}
          onChange={handleRepoChange}
          className="text-sm bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">No repo selected</option>
          {repos.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
        </select>
        {selectedRepo && (
          <select
            value={selectedBranch || ''}
            onChange={handleBranchChange}
            className="text-sm bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
            disabled={loadingBranches}
          >
            <option value="">{loadingBranches ? 'Loading...' : 'Select branch'}</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}
      </div>
    </header>
  );
}
