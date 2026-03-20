'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * A single Code IDE tab wrapped with @dnd-kit/sortable for drag-and-drop reordering.
 * Uses stable string tab IDs ('code' | 'shell' | 'editor') — not port-based.
 * No close button — the 3 Code IDE tabs are fixed and cannot be closed.
 *
 * @param {object} props
 * @param {string} props.id - Tab ID ('code' | 'shell' | 'editor')
 * @param {string} props.label - Display label ('Code' | 'Shell' | 'Editor')
 * @param {boolean} props.isActive - Whether this tab is currently selected
 * @param {function} props.onClick - Called when tab is clicked
 */
export function SortableCodeTab({ id, label, isActive, onClick }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '4px 12px',
    fontSize: '13px',
    fontWeight: isActive ? '600' : '400',
    backgroundColor: isActive ? '#313244' : 'transparent',
    color: isActive ? '#89b4fa' : '#a6adc8',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    userSelect: 'none',
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      role="tab"
      aria-selected={isActive}
      aria-controls={`panel-${id}`}
    >
      {label}
    </button>
  );
}
