'use client';

import { useState, useEffect } from 'react';
import { Streamdown } from 'streamdown';
import { PageLayout } from './page-layout.js';
import { LifeBuoyIcon, ChevronDownIcon } from './icons.js';
import { linkSafety } from './message.js';
import { getSupportGuides } from '../actions.js';

function GuideCard({ guide }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span className="font-medium text-sm">{guide.title}</span>
        <ChevronDownIcon
          size={16}
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 prose prose-sm max-w-none border-t border-border">
          <Streamdown mode="static" linkSafety={linkSafety}>{guide.content}</Streamdown>
        </div>
      )}
    </div>
  );
}

export function SupportPage({ session }) {
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await getSupportGuides();
        setGuides(result);
      } catch (err) {
        console.error('Failed to load support guides:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <LifeBuoyIcon size={24} className="text-muted-foreground" />
        <h1 className="text-2xl font-semibold">Platform Guides</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Documentation and guides for operating ClawForge
      </p>

      {/* Guide list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-border/50" />
          ))}
        </div>
      ) : guides.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No guides available.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {guides.map((guide) => (
            <GuideCard key={guide.slug} guide={guide} />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
