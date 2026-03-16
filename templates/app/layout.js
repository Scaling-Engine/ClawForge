import './globals.css';
import { ThemeProvider } from './components/theme-provider';
import path from 'path';
import fs from 'fs';

export async function generateMetadata() {
  let agentName = 'ClawForge';
  try {
    const soulMd = path.join(process.cwd(), 'config', 'SOUL.md');
    const content = fs.readFileSync(soulMd, 'utf8');
    const match = content.match(/^#\s+(\S+)/);
    if (match) agentName = match[1];
    else if (process.env.INSTANCE_NAME) agentName = process.env.INSTANCE_NAME;
  } catch {
    if (process.env.INSTANCE_NAME) agentName = process.env.INSTANCE_NAME;
  }
  return {
    title: agentName,
    description: 'AI Agent',
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
