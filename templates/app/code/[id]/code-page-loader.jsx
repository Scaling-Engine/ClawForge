'use client';

import dynamic from 'next/dynamic';

const CodePageClient = dynamic(() => import('./code-page.jsx'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1e1e2e',
      color: '#585b70',
      fontSize: '13px',
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    }}>
      Loading workspace...
    </div>
  ),
});

export default function CodePageLoader(props) {
  return <CodePageClient {...props} />;
}
