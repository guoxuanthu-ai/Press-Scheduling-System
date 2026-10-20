import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

export type SyncStatus = 'connecting' | 'online' | 'offline';

export function useRealtimeSync(): SyncStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const revision = useRef(-1);
  useEffect(() => {
    const events = new EventSource('/api/events');
    setStatus('connecting');
    const onRevision = (event: Event) => {
      const next = JSON.parse((event as MessageEvent).data) as { revision: number };
      setStatus('online');
      if (revision.current >= 0 && next.revision > revision.current) {
        void queryClient.invalidateQueries();
      }
      revision.current = next.revision;
    };
    events.addEventListener('revision', onRevision);
    events.onerror = () => setStatus('offline');
    return () => events.close();
  }, [queryClient]);
  return status;
}
