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
import { useFeature } from '../features-context.js';

export function Chat({ chatId, initialMessages = [], isAdmin = false }) {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [codeActive, setCodeActive] = useState(false);
  const [codeSubMode, setCodeSubMode] = useState('plan'); // 'plan' | 'code'
  const [terminalSessionId, setTerminalSessionId] = useState(null);
  const hasNavigated = useRef(false);
  // Ref so the transport useMemo can read the latest sessionId without re-creating on every update
  const terminalSessionIdRef = useRef(null);

  const [isLaunching, setIsLaunching] = useState(false);
  const [linkedWorkspaceId, setLinkedWorkspaceId] = useState(null);
  const router = useRouter();

  const codeWorkspaceEnabled = useFeature('codeWorkspace');
  const canUseCode = isAdmin && codeWorkspaceEnabled;

  const { selectedRepo, selectedBranch } = useRepoChat();

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
          codeSubMode: codeActive ? codeSubMode : undefined,
        },
        fetch: codeActive ? terminalFetch : undefined,
      }),
    [chatId, selectedRepo, selectedBranch, codeActive, codeSubMode, terminalFetch]
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
      if (workspace && (workspace.status === 'running' || workspace.status === 'starting')) {
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
      const { workspaceId } = await launchWorkspace({ chatId, repoSlug: selectedRepo.slug });
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

  return (
    <div className="flex h-svh flex-col">
      <ChatHeader chatId={chatId} />
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 md:px-6">
          <div className="w-full max-w-4xl">
            <Greeting />
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
                onToggleCode={canUseCode ? () => setCodeActive((prev) => !prev) : undefined}
                codeSubMode={codeSubMode}
                onChangeCodeSubMode={(mode) => setCodeSubMode(mode)}
                onLaunchInteractive={canUseCode ? handleLaunchInteractive : undefined}
                isLaunching={isLaunching}
                linkedWorkspaceId={linkedWorkspaceId}
                hasRepoSelected={!!selectedRepo?.slug}
              />
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
            onToggleCode={canUseCode ? () => setCodeActive((prev) => !prev) : undefined}
            codeSubMode={codeSubMode}
            onChangeCodeSubMode={(mode) => setCodeSubMode(mode)}
            onLaunchInteractive={canUseCode ? handleLaunchInteractive : undefined}
            isLaunching={isLaunching}
            linkedWorkspaceId={linkedWorkspaceId}
            hasRepoSelected={!!selectedRepo?.slug}
          />
        </>
      )}
    </div>
  );
}
