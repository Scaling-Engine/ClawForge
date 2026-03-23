'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Messages } from './messages.js';
import { ChatInput } from './chat-input.js';
import { ChatHeader } from './chat-header.js';
import { Greeting } from './greeting.js';
import { useRepoChat } from '../repo-chat-context.js';
import { launchWorkspace, getLinkedWorkspace } from './code/actions.js';
import { useFeature } from '../features-context.jsx';
import { getRepos, getBranches } from '../actions.js';
import { cn } from '../utils.js';

export function Chat({ chatId, initialMessages = [], isAdmin = false }) {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [codeActive, setCodeActive] = useState(false);
  const [terminalSessionId, setTerminalSessionId] = useState(null);
  const hasNavigated = useRef(false);
  // Ref so the transport useMemo can read the latest sessionId without re-creating on every update
  const terminalSessionIdRef = useRef(null);

  const [isLaunching, setIsLaunching] = useState(false);
  const [linkedWorkspaceId, setLinkedWorkspaceId] = useState(null);
  const router = useRouter();

  const codeWorkspaceEnabled = useFeature('codeWorkspace');
  const canUseCode = isAdmin && codeWorkspaceEnabled;

  const { selectedRepo, setSelectedRepo, selectedBranch, setSelectedBranch } = useRepoChat();

  // Repo/branch state (moved from chat-header)
  const [repos, setRepos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const branchLoadingForRepo = useRef(null);

  useEffect(() => {
    getRepos().then(setRepos).catch(() => setRepos([]));
  }, []);

  const handleRepoChange = useCallback(async (fullSlug) => {
    if (!fullSlug) {
      setSelectedRepo(null);
      setSelectedBranch(null);
      setBranches([]);
      return;
    }
    const repo = repos.find((r) => `${r.owner}/${r.slug}` === fullSlug);
    if (!repo) return;
    setSelectedRepo(repo);
    setSelectedBranch(null);
    setBranches([]);
    setLoadingBranches(true);
    branchLoadingForRepo.current = fullSlug;
    const result = await getBranches(repo.owner, repo.slug);
    if (branchLoadingForRepo.current === fullSlug) {
      setBranches(result);
      setLoadingBranches(false);
    }
  }, [repos, setSelectedRepo, setSelectedBranch]);

  const handleBranchChange = useCallback((branch) => {
    setSelectedBranch(branch || null);
  }, [setSelectedBranch]);

  // Custom fetch wrapper that captures X-Terminal-Session-Id from response headers
  const terminalFetch = useCallback(async (input, init) => {
    const response = await fetch(input, init);
    const sessionId = response.headers.get('X-Terminal-Session-Id');
    if (sessionId) {
      terminalSessionIdRef.current = sessionId;
      setTerminalSessionId(sessionId);
    }
    return response;
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: codeActive ? '/stream/terminal' : '/stream/chat',
        body: {
          chatId,
          selectedRepo: selectedRepo?.slug || null,
          selectedBranch: selectedBranch || null,
          // Terminal-specific fields (ignored by /stream/chat)
          sessionId: codeActive ? terminalSessionIdRef.current : undefined,
          shellMode: false,
          thinkingEnabled: codeActive ? true : undefined,
        },
        fetch: codeActive ? terminalFetch : undefined,
      }),
    [chatId, selectedRepo, selectedBranch, codeActive, terminalFetch]
  );

  const {
    messages,
    status,
    stop,
    error,
    sendMessage,
    regenerate,
    setMessages,
  } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onError: (err) => console.error('Chat error:', err),
  });

  // Check for linked workspace on mount and when chatId changes
  useEffect(() => {
    if (!chatId) return;
    getLinkedWorkspace({ chatId }).then(({ workspace }) => {
      if (workspace && workspace.status === 'running') {
        setLinkedWorkspaceId(workspace.id);
      } else {
        setLinkedWorkspaceId(null);
      }
    }).catch(() => setLinkedWorkspaceId(null));
  }, [chatId]);

  // Launch workspace or navigate to existing linked workspace
  const handleLaunchInteractive = useCallback(async () => {
    // If already linked to a running workspace, just navigate
    if (linkedWorkspaceId) {
      router.push(`/code/${linkedWorkspaceId}`);
      return;
    }

    // Guard: require a selected repo
    if (!selectedRepo?.slug) return;
    if (isLaunching) return;

    setIsLaunching(true);
    try {
      const { workspaceId } = await launchWorkspace({ chatId, repoSlug: `${selectedRepo.owner}/${selectedRepo.slug}` });
      router.push(`/code/${workspaceId}`);
    } catch (err) {
      console.error('Failed to launch workspace:', err);
      setIsLaunching(false);
    }
  }, [chatId, selectedRepo, isLaunching, linkedWorkspaceId, router]);

  // After first message sent, update URL and notify sidebar
  useEffect(() => {
    if (!hasNavigated.current && messages.length >= 1 && status !== 'ready' && window.location.pathname !== `/chat/${chatId}`) {
      hasNavigated.current = true;
      window.history.replaceState({}, '', `/chat/${chatId}`);
      window.dispatchEvent(new Event('chatsupdated'));
      // Dispatch again after delay to pick up async title update
      setTimeout(() => window.dispatchEvent(new Event('chatsupdated')), 5000);
    }
  }, [messages.length, status, chatId]);

  const handleSend = () => {
    if (!input.trim() && files.length === 0) return;
    const rawText = input;
    const text = rawText;
    const currentFiles = files;
    setInput('');
    setFiles([]);

    if (currentFiles.length === 0) {
      sendMessage({ text });
    } else {
      // Build FileUIPart[] from pre-read data URLs (File[] isn't a valid type)
      const fileParts = currentFiles.map((f) => ({
        type: 'file',
        mediaType: f.file.type || 'text/plain',
        url: f.previewUrl,
        filename: f.file.name,
      }));
      sendMessage({ text: text || undefined, files: fileParts });
    }
  };

  const handleRetry = useCallback((message) => {
    if (message.role === 'assistant') {
      regenerate({ messageId: message.id });
    } else {
      // User message — find the next assistant message and regenerate it
      const idx = messages.findIndex((m) => m.id === message.id);
      const nextAssistant = messages.slice(idx + 1).find((m) => m.role === 'assistant');
      if (nextAssistant) {
        regenerate({ messageId: nextAssistant.id });
      } else {
        // No assistant response yet — extract text and resend
        const text =
          message.parts
            ?.filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('\n') ||
          message.content ||
          '';
        if (text.trim()) {
          sendMessage({ text });
        }
      }
    }
  }, [messages, regenerate, sendMessage]);

  const handleEdit = useCallback((message, newText) => {
    const idx = messages.findIndex((m) => m.id === message.id);
    if (idx === -1) return;
    // Truncate conversation to before this message, then send edited text
    setMessages(messages.slice(0, idx));
    sendMessage({ text: newText });
  }, [messages, setMessages, sendMessage]);

  const isStreaming = status === 'streaming' || status === 'submitted';

  // Below-input control bar — rendered after each ChatInput
  const BelowInputBar = (
    <div className="mx-auto w-full max-w-4xl px-4 md:px-6 pb-2">
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {/* Code pill toggle — admin only */}
        {canUseCode && (
          <button
            type="button"
            onClick={() => setCodeActive((prev) => !prev)}
            disabled={isStreaming}
            aria-pressed={codeActive}
            aria-label="Toggle Code mode"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <span
              className={cn(
                'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                codeActive ? 'bg-green-500' : 'bg-muted-foreground/30'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200',
                  codeActive ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </span>
            <span className="text-xs font-medium">Code</span>
          </button>
        )}

        {/* Repo selector — visible only when Code is ON */}
        {codeActive && (
          <select
            value={selectedRepo ? `${selectedRepo.owner}/${selectedRepo.slug}` : ''}
            onChange={(e) => handleRepoChange(e.target.value)}
            disabled={isStreaming}
            className="text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          >
            <option value="">No repo selected</option>
            {repos.map((r) => (
              <option key={`${r.owner}/${r.slug}`} value={`${r.owner}/${r.slug}`}>
                {r.owner}/{r.name}
              </option>
            ))}
          </select>
        )}

        {/* Branch selector — visible only when Code is ON and a repo is selected */}
        {codeActive && selectedRepo && (
          <select
            value={selectedBranch || ''}
            onChange={(e) => handleBranchChange(e.target.value)}
            disabled={isStreaming || loadingBranches}
            className="text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          >
            <option value="">{loadingBranches ? 'Loading...' : 'Select branch'}</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}

        {/* Headless toggle — visible only when Code is ON */}
        {codeActive && (
          <button
            type="button"
            onClick={handleLaunchInteractive}
            disabled={isStreaming || isLaunching || (!linkedWorkspaceId && !selectedRepo?.slug)}
            aria-pressed={!!linkedWorkspaceId}
            aria-label="Launch headless workspace"
            title={!linkedWorkspaceId && !selectedRepo?.slug ? 'Select a repo first' : undefined}
            className={cn(
              'flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground',
              (!linkedWorkspaceId && !selectedRepo?.slug) && 'opacity-50 cursor-not-allowed',
              isLaunching && 'opacity-50 cursor-wait'
            )}
          >
            <span
              className={cn(
                'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                linkedWorkspaceId ? 'bg-green-500' : 'bg-muted-foreground/30'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200',
                  linkedWorkspaceId ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </span>
            <span className="text-xs font-medium">
              {isLaunching ? 'Launching...' : linkedWorkspaceId ? 'Resume' : 'Headless'}
            </span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-svh flex-col">
      <ChatHeader chatId={chatId} />
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 md:px-6">
          <div className="w-full max-w-4xl">
            <Greeting codeActive={codeActive} />
            {error && (
              <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {error.message || 'Something went wrong. Please try again.'}
              </div>
            )}
            <div className="mt-4">
              <ChatInput
                input={input}
                setInput={setInput}
                onSubmit={handleSend}
                status={status}
                stop={stop}
                files={files}
                setFiles={setFiles}
                codeActive={codeActive}
              />
              {BelowInputBar}
            </div>
          </div>
        </div>
      ) : (
        <>
          <Messages messages={messages} status={status} onRetry={handleRetry} onEdit={handleEdit} />
          {error && (
            <div className="mx-auto w-full max-w-4xl px-2 md:px-4">
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {error.message || 'Something went wrong. Please try again.'}
              </div>
            </div>
          )}
          <ChatInput
            input={input}
            setInput={setInput}
            onSubmit={handleSend}
            status={status}
            stop={stop}
            files={files}
            setFiles={setFiles}
            codeActive={codeActive}
          />
          {BelowInputBar}
        </>
      )}
    </div>
  );
}
