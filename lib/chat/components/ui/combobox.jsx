'use client';

import { useState, useRef, useEffect } from 'react';
import { SearchIcon, ChevronDownIcon, CheckIcon } from '../icons.js';
import { cn } from '../../utils.js';

export function Combobox({
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  loading = false,
  disabled = false,
  highlight = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  function handleToggle() {
    if (disabled || loading) return;
    setOpen((prev) => {
      if (!prev) {
        setSearch('');
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      return !prev;
    });
  }

  function handleSelect(option) {
    onChange(option.value);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled || loading}
        className={cn(
          'flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm',
          'transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          highlight && 'border-primary ring-1 ring-primary',
          !highlight && 'border-input',
          (disabled || loading) && 'cursor-not-allowed opacity-50'
        )}
      >
        <span className={cn(!selectedOption && 'text-muted-foreground')}>
          {loading
            ? 'Loading...'
            : selectedOption
              ? selectedOption.label
              : placeholder}
        </span>
        <ChevronDownIcon
          size={16}
          className={cn(
            'ml-2 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <div className="flex items-center border-b border-border px-3 py-2">
            <SearchIcon size={14} className="mr-2 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-sm',
                    'cursor-pointer hover:bg-accent hover:text-accent-foreground',
                    option.value === value && 'bg-accent/50'
                  )}
                >
                  <span>{option.label}</span>
                  {option.value === value && (
                    <CheckIcon size={14} className="ml-2 shrink-0 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
