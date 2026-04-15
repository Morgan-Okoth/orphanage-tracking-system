'use client';

import { useState, useEffect } from 'react';

export type ConnectionType = 'slow' | 'medium' | 'fast' | 'unknown';

interface NetworkInformation {
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  downlink?: number;
  saveData?: boolean;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

function getConnectionType(nav: Navigator & { connection?: NetworkInformation }): ConnectionType {
  const conn = nav.connection;
  if (!conn) return 'unknown';
  if (conn.saveData) return 'slow';
  switch (conn.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 'slow';
    case '3g':
      return 'medium';
    case '4g':
      return 'fast';
    default:
      return 'unknown';
  }
}

export function useConnectionSpeed(): ConnectionType {
  const [speed, setSpeed] = useState<ConnectionType>('unknown');

  useEffect(() => {
    const nav = navigator as Navigator & { connection?: NetworkInformation };
    setSpeed(getConnectionType(nav));

    const conn = nav.connection;
    if (!conn) return;

    const handler = () => setSpeed(getConnectionType(nav));
    conn.addEventListener('change', handler);
    return () => conn.removeEventListener('change', handler);
  }, []);

  return speed;
}
