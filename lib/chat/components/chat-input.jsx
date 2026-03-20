'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { SendIcon, StopIcon, PaperclipIcon, XIcon, FileTextIcon, MicIcon, MicOffIcon } from './icons.js';
import { VoiceBars } from './voice-bars.jsx';
import { isVoiceSupported } from '../../voice/config.js';
import { startMicCapture } from '../../voice/recorder.js';
import { createTranscriber } from '../../voice/transcription.js';
import { getVoiceToken } from '../actions.js';
import { cn } from '../utils.js';

const ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/css',
  'text/javascript', 'text/x-python', 'text/x-typescript',
  'application/json',
];

const MAX_FILES = 5;

function isAcceptedType(file) {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  // Fall back to extension for files with generic MIME types
  const ext = file.name?.split('.').pop()?.toLowerCase();
  const textExts = ['txt', 'md', 'csv', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'yml', 'yaml', 'xml', 'sh', 'bash', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp'];
  return textExts.includes(ext);
}

function getEffectiveType(file) {
  if (ACCEPTED_TYPES.includes(file.type) && file.type !== '') return file.type;
  const ext = file.name?.split('.').pop()?.toLowerCase();
  const extMap = {
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    json: 'application/json', js: 'text/javascript', ts: 'text/x-typescript',
    jsx: 'text/javascript', tsx: 'text/x-typescript', py: 'text/x-python',
    html: 'text/html', css: 'text/css', yml: 'text/plain', yaml: 'text/plain',
    xml: 'text/plain', sh: 'text/plain', bash: 'text/plain', rb: 'text/plain',
    go: 'text/plain', rs: 'text/plain', java: 'text/plain', c: 'text/plain',
    cpp: 'text/plain', h: 'text/plain', hpp: 'text/plain',
  };
  return extMap[ext] || file.type || 'text/plain';
}

export function ChatInput({ input, setInput, onSubmit, status, stop, files, setFiles, codeActive = false, onToggleCode, codeSubMode = 'plan', onChangeCodeSubMode }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(0);
  const [voiceError, setVoiceError] = useState(null);
  const [interimText, setInterimText] = useState('');
  const recorderRef = useRef(null);
  const transcriberRef = useRef(null);
  const voiceSupported = isVoiceSupported();
  const isStreaming = status === 'streaming' || status === 'submitted';

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Voice recording cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      transcriberRef.current?.close();
    };
  }, []);

  // Auto-dismiss voice errors after 5 seconds
  useEffect(() => {
    if (voiceError) {
      const timer = setTimeout(() => setVoiceError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [voiceError]);

  const startRecording = async () => {
    setVoiceError(null);

    // Get temporary token from server
    const result = await getVoiceToken();
    if (result.error) {
      setVoiceError(result.error);
      return;
    }

    // Create transcriber connection
    const transcriber = createTranscriber({
      token: result.token,
      onTranscript({ text, isFinal }) {
        if (isFinal) {
          setInput((prev) => (prev ? prev + ' ' + text : text));
          setInterimText('');
        } else {
          setInterimText(text);
        }
      },
      onError(msg) {
        setVoiceError(msg);
      },
    });
    transcriberRef.current = transcriber;

    // Start mic capture
    const recorder = await startMicCapture({
      onAudioData(buffer) {
        transcriberRef.current?.send(buffer);
      },
      onVolume(v) {
        setVolume(v);
      },
      onError(msg) {
        setVoiceError(msg);
        setIsRecording(false);
      },
    });

    if (!recorder) {
      // Permission denied or mic not found — clean up transcriber
      transcriber.close();
      transcriberRef.current = null;
      return;
    }

    recorderRef.current = recorder;
    setIsRecording(true);
  };

  const stopRecording = () => {
    transcriberRef.current?.close();
    transcriberRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
    setVolume(0);
    setInterimText('');
  };

  const handleFiles = useCallback((fileList) => {
    const newFiles = Array.from(fileList).filter(isAcceptedType);
    if (newFiles.length === 0) return;

    // Read files outside state updater to avoid React strict mode double-invocation
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setFiles((current) => {
          if (current.length >= MAX_FILES) return current;
          return [...current, { file, previewUrl: reader.result }];
        });
      };
      reader.readAsDataURL(file);
    });
  }, [setFiles]);

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if ((!input.trim() && files.length === 0) || isStreaming) return;
    onSubmit();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const canSend = input.trim() || files.length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-4 md:px-6">
      <form onSubmit={handleSubmit} className="relative">
        <div
          className={cn(
            'flex flex-col rounded-xl border bg-muted p-2 transition-colors',
            isDragging ? 'border-primary bg-primary/5' : 'border-border'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* File preview strip */}
          {files.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto px-1 py-1">
              {files.map((f, i) => {
                const isImage = f.file.type.startsWith('image/');
                return (
                  <div key={i} className="group relative flex-shrink-0">
                    {isImage ? (
                      <img
                        src={f.previewUrl}
                        alt={f.file.name}
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-16 items-center gap-1.5 rounded-lg bg-foreground/10 px-3">
                        <FileTextIcon size={14} />
                        <span className="max-w-[100px] truncate text-xs">
                          {f.file.name}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-foreground p-0.5 text-background group-hover:flex items-center justify-center"
                      aria-label={`Remove ${f.file.name}`}
                    >
                      <XIcon size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="relative flex items-end gap-2">
            {/* Interim transcription text */}
            {isRecording && interimText && (
              <div className="absolute bottom-full left-0 right-0 px-3 py-1 text-xs text-muted-foreground italic truncate">
                {interimText}
              </div>
            )}
            {/* Paperclip button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground"
              aria-label="Attach files"
              disabled={isStreaming}
            >
              <PaperclipIcon size={16} />
            </button>

            {/* Unified Code toggle — admin only (onToggleCode is undefined for non-admins) */}
            {onToggleCode && (
              <button
                type="button"
                onClick={onToggleCode}
                className={cn(
                  'inline-flex items-center justify-center rounded-lg px-2 py-1 text-xs font-mono',
                  codeActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-label="Toggle Code mode"
                aria-pressed={codeActive}
                disabled={isStreaming}
                title="Code mode — routes to Claude Code CLI"
              >
                {'</>'}
              </button>
            )}

            {/* Plan/Code sub-mode dropdown — visible only when Code toggle is active */}
            {codeActive && onToggleCode && (
              <select
                value={codeSubMode}
                onChange={(e) => onChangeCodeSubMode(e.target.value)}
                className="text-xs bg-transparent border border-border rounded px-1 py-1 text-muted-foreground focus:outline-none"
                disabled={isStreaming}
                aria-label="Code sub-mode"
              >
                <option value="plan">Plan</option>
                <option value="code">Code</option>
              </select>
            )}

            {/* Mic button — hidden if browser lacks AudioWorklet */}
            {voiceSupported && (
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  'inline-flex items-center justify-center rounded-lg p-2 transition-colors',
                  isRecording
                    ? 'bg-red-500/10 text-red-500'
                    : 'text-muted-foreground hover:text-foreground',
                  voiceError && 'text-destructive'
                )}
                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                disabled={isStreaming}
                title={voiceError || (isRecording ? 'Stop recording' : 'Voice input')}
              >
                {isRecording ? (
                  <span className="flex items-center gap-1">
                    <MicOffIcon size={16} />
                    <VoiceBars volume={volume} />
                  </span>
                ) : (
                  <MicIcon size={16} />
                )}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,text/*,application/json,.md,.csv,.json,.js,.ts,.jsx,.tsx,.py,.html,.css,.yml,.yaml,.xml,.sh,.rb,.go,.rs,.java,.c,.cpp,.h"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              rows={1}
              className={cn(
                'flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground',
                'placeholder:text-muted-foreground focus:outline-none',
                'max-h-[200px]',
                codeActive && 'font-mono'
              )}
              disabled={isStreaming}
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex items-center justify-center rounded-lg bg-foreground p-2 text-background hover:opacity-80"
                aria-label="Stop generating"
              >
                <StopIcon size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className={cn(
                  'inline-flex items-center justify-center rounded-lg p-2',
                  canSend
                    ? 'bg-foreground text-background hover:opacity-80'
                    : 'bg-muted-foreground/20 text-muted-foreground cursor-not-allowed'
                )}
                aria-label="Send message"
              >
                <SendIcon size={16} />
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
