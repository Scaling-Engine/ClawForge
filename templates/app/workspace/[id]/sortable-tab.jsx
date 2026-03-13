'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const BASE_PORT = 7681;

/**
 * A single workspace tab wrapped with @dnd-kit/sortable for drag-and-drop reordering.
 * Uses stable tab.id as the sortable key so React never unmounts Terminal components.
 *
 * @param {object} props
 * @param {object} props.tab - Tab object { id, port, ticket }
 * @param {boolean} props.isActive - Whether this tab is currently selected
 * @param {boolean} props.isDisconnected - Whether this tab's WebSocket is disconnected
 * @param {function} props.onSelect - Called when tab is clicked
 * @param {function} props.onClose - Called when close button is clicked
 * @param {boolean} props.showClose - Whether to show the close button
 */
export function SortableTab({ tab, isActive, isDisconnected, onSelect, onClose, showClose }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: isActive ? '#313244' : 'transparent',
    color: isDisconnected ? '#f38ba8' : '#cdd6f4',
    border: '1px solid',
    borderColor: isActive ? '#585b70' : 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
    >
      Shell {tab.port === BASE_PORT ? '1' : tab.port - BASE_PORT + 1}
      {isDisconnected && ' (disconnected)'}
      {showClose && (
        <span
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{ color: '#585b70', cursor: 'pointer', marginLeft: '4px' }}
        >
          x
        </span>
      )}
    </button>
  );
}
