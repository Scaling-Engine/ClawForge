'use client';

import { useState, useEffect } from 'react';
import { getAgentName } from '../actions.js';

export function Greeting() {
  const [agentName, setAgentName] = useState('');

  useEffect(() => {
    getAgentName().then(setAgentName).catch(() => {});
  }, []);

  return (
    <div className="w-full text-center">
      <div className="font-semibold text-2xl md:text-3xl text-foreground">
        {agentName ? `Hello! I'm ${agentName}. How can I help?` : 'Hello! How can I help?'}
      </div>
    </div>
  );
}
