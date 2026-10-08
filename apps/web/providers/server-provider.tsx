import { type ReactNode } from 'react';

interface ServerConfig {
  apiUrl: string;
  environment: string;
  version: string;
}

function getServerConfig(): ServerConfig {
  return {
    apiUrl: '/api/bff',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
  };
}

interface ServerProviderProps {
  children: ReactNode;
}

export function ServerProvider({ children }: ServerProviderProps) {
  const config = getServerConfig();

  return <div data-server-config={JSON.stringify(config)}>{children}</div>;
}
