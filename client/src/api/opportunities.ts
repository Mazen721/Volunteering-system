import type { OpportunityListResponse } from '../types';
import { apiClient } from './client';

const OPPORTUNITY_PAGE_SIZE = 200;

/**
 * Fetches the full opportunity list for board/home/manage by paging through
 * the (now bounded) list endpoint. A response without pagination metadata
 * is treated as already complete, so older payloads keep working.
 */
export async function fetchAllOpportunities(
  params?: Record<string, string>
): Promise<OpportunityListResponse> {
  const first = await apiClient.get<OpportunityListResponse>('/opportunities', {
    params: { ...params, page: 1, limit: OPPORTUNITY_PAGE_SIZE },
  });
  const data = first.data;
  if (typeof data.total !== 'number' || !Array.isArray(data.opportunities)) {
    return data;
  }
  const pages = data.pages ?? Math.max(1, Math.ceil(data.total / OPPORTUNITY_PAGE_SIZE));
  if (pages <= 1) {
    return data;
  }
  const all = [...data.opportunities];
  for (let page = 2; page <= pages; page += 1) {
    const next = await apiClient.get<OpportunityListResponse>('/opportunities', {
      params: { ...params, page, limit: OPPORTUNITY_PAGE_SIZE },
    });
    all.push(...next.data.opportunities);
  }
  return { ...data, opportunities: all };
}
