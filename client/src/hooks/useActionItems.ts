import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { ActionItemsResponse } from '../types';

async function fetchActionItems(): Promise<ActionItemsResponse | null> {
  try {
    const response = await apiClient.get<ActionItemsResponse>('/stats/action-items');
    return response.data;
  } catch {
    // The action blocks are advisory; never break the dashboard over them.
    return null;
  }
}

/**
 * Loads the staff action items (opportunities awaiting completion and urgent
 * pending applications) for the admin/dean dashboard. A failed load simply
 * hides the blocks — the rest of the dashboard stays fully usable.
 */
export function useActionItems() {
  const [actionItems, setActionItems] = useState<ActionItemsResponse | null>(null);

  const reloadActionItems = useCallback(async () => {
    const data = await fetchActionItems();
    if (data) {
      setActionItems(data);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchActionItems().then((data) => {
      if (!cancelled && data) {
        setActionItems(data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { actionItems, reloadActionItems };
}
