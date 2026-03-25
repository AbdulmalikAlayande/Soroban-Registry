'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ContractSearchParams, Contract } from '@/lib/api';
import ContractCard from '@/components/ContractCard';
import ContractCardSkeleton from '@/components/ContractCardSkeleton';
import { ActiveFilters } from '@/components/contracts/ActiveFilters';
import { FilterPanel } from '@/components/contracts/FilterPanel';
import { ALL_NETWORK_FILTERS, NetworkSelectorDropdown } from '@/components/contracts/NetworkSelectorDropdown';
import { ResultsCount } from '@/components/contracts/ResultsCount';
import { SearchBar } from '@/components/contracts/SearchBar';
import { SortDropdown, SortBy } from '@/components/contracts/SortDropdown';
import { Filter, Package, SlidersHorizontal, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAnalytics } from '@/hooks/useAnalytics';

const DEFAULT_PAGE_SIZE = 12;
const CATEGORY_OPTIONS = [
  'DeFi',
  'NFT',
  'Governance',
  'Infrastructure',
  'Payment',
  'Identity',
  'Gaming',
  'Social',
];
const LANGUAGE_OPTIONS = [
  'Rust',
  'TypeScript',
  'JavaScript',
  'AssemblyScript',
  'Move',
];
const NETWORK_PREFERENCE_KEY = 'soroban-registry.contract-network-preferences';

function parseCsvOrMulti(values: string[]) {
  return values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

function removeOne<T>(values: T[], value: T) {
  return values.filter((current) => current !== value);
}

function toggleOne<T>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((current) => current !== value)
    : [...values, value];
}

function isAllNetworksSelected(values: NonNullable<ContractSearchParams['network']>[]) {
  return values.length === ALL_NETWORK_FILTERS.length;
}

type ContractsUiFilters = {
  query: string;
  categories: string[];
  languages: string[];
  author: string;
  networks: NonNullable<ContractSearchParams['network']>[];
  verified_only: boolean;
  sort_by: SortBy;
  sort_order: 'asc' | 'desc';
  page: number;
  page_size: number;
};

function getInitialFilters(searchParams: URLSearchParams): ContractsUiFilters {
  const query = searchParams.get('query') || searchParams.get('q') || '';
  const categories = parseCsvOrMulti(searchParams.getAll('category'));
  const languages = parseCsvOrMulti(searchParams.getAll('language'));
  const parsedNetworks = parseCsvOrMulti(searchParams.getAll('network')).filter(
    (network): network is NonNullable<ContractSearchParams['network']> =>
      network === 'mainnet' || network === 'testnet' || network === 'futurenet',
  );
  const networks = parsedNetworks.length > 0 ? parsedNetworks : [...ALL_NETWORK_FILTERS];

  const sortBy = searchParams.get('sort_by') as SortBy;
  const sortOrder = searchParams.get('sort_order') as 'asc' | 'desc';
  const parsedPage = Number(searchParams.get('page') || '1');

  const validSortBys: SortBy[] = ['name', 'created_at', 'updated_at', 'popularity', 'deployments', 'interactions', 'relevance', 'downloads'];

  return {
    query,
    categories,
    languages,
    author: searchParams.get('author') || '',
    networks,
    verified_only: searchParams.get('verified_only') === 'true',
    sort_by: validSortBys.includes(sortBy) ? sortBy : (query ? 'relevance' : 'created_at'),
    sort_order: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : 'desc',
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    page_size: DEFAULT_PAGE_SIZE,
  };
}

export function ContractsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { logEvent } = useAnalytics();
  const lastSearchSignatureRef = useRef<string>('');

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);

  const [filters, setFilters] = useState<ContractsUiFilters>(() =>
    getInitialFilters(new URLSearchParams(searchParams.toString())),
  );

  const debouncedQuery = useDebouncedValue(filters.query, 300);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const hasNetworkQuery = searchParams.getAll('network').length > 0;
    if (hasNetworkQuery) {
      setPreferencesReady(true);
      return;
    }

    const savedValue = window.localStorage.getItem(NETWORK_PREFERENCE_KEY);
    if (!savedValue) {
      setPreferencesReady(true);
      return;
    }

    try {
      const parsedValue = JSON.parse(savedValue);
      if (Array.isArray(parsedValue)) {
        const savedNetworks = parsedValue.filter(
          (network): network is NonNullable<ContractSearchParams['network']> =>
            ALL_NETWORK_FILTERS.includes(network),
        );

        setFilters((current) => ({ ...current, networks: savedNetworks }));
      }
    } catch {
      window.localStorage.removeItem(NETWORK_PREFERENCE_KEY);
    } finally {
      setPreferencesReady(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    const params = new URLSearchParams();
    if (debouncedQuery) params.set('query', debouncedQuery);
    filters.categories.forEach((category) => params.append('category', category));
    filters.languages.forEach((language) => params.append('language', language));
    if (!isAllNetworksSelected(filters.networks)) {
      filters.networks.forEach((network) => params.append('network', network));
    }
    if (filters.author) params.set('author', filters.author);
    if (filters.verified_only) params.set('verified_only', 'true');
    if (filters.sort_by) params.set('sort_by', filters.sort_by);
    if (filters.sort_order) params.set('sort_order', filters.sort_order);
    if (filters.page > 1) params.set('page', String(filters.page));
    params.set('page_size', String(filters.page_size));

    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [debouncedQuery, filters, pathname, preferencesReady, router]);

  useEffect(() => {
    if (!preferencesReady || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      NETWORK_PREFERENCE_KEY,
      JSON.stringify(filters.networks),
    );
  }, [filters.networks, preferencesReady]);

  const shouldFilterByNetwork = filters.networks.length > 0 && !isAllNetworksSelected(filters.networks);

  const apiParams = useMemo<ContractSearchParams>(
    () => ({
      query: debouncedQuery || undefined,
      categories: filters.categories.length > 0 ? filters.categories : undefined,
      languages: filters.languages.length > 0 ? filters.languages : undefined,
      author: filters.author || undefined,
      networks: shouldFilterByNetwork ? filters.networks : undefined,
      verified_only: filters.verified_only,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order,
      page: filters.page,
      page_size: filters.page_size,
    }),
    [debouncedQuery, filters, shouldFilterByNetwork],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['contracts', apiParams],
    queryFn: () => api.getContracts(apiParams),
    enabled: preferencesReady && filters.networks.length > 0,
    placeholderData: (previousData) => previousData,
  });

  const effectiveData = useMemo(
    () =>
      filters.networks.length === 0
        ? {
            items: [],
            total: 0,
            page: filters.page,
            page_size: filters.page_size,
            total_pages: 0,
          }
        : data,
    [data, filters.page, filters.page_size, filters.networks.length],
  );

  useEffect(() => {
    if (!preferencesReady) return;

    const payload = {
      keyword: debouncedQuery || '',
      categories: filters.categories,
      languages: filters.languages,
      networks: filters.networks,
      author: filters.author || undefined,
      verified_only: filters.verified_only,
      sort_by: filters.sort_by,
      page: filters.page,
      page_size: filters.page_size,
    };

    const hasSearchInput =
      Boolean(payload.keyword) ||
      payload.categories.length > 0 ||
      payload.languages.length > 0 ||
      !isAllNetworksSelected(payload.networks) ||
      Boolean(payload.author) ||
      payload.verified_only ||
      payload.sort_by !== 'created_at' ||
      payload.page > 1;

    if (!hasSearchInput) return;

    const signature = JSON.stringify(payload);
    if (lastSearchSignatureRef.current === signature) return;
    lastSearchSignatureRef.current = signature;

    logEvent('search_performed', payload);
  }, [debouncedQuery, filters, logEvent, preferencesReady]);

  const clearAllFilters = () =>
    setFilters((current) => ({
      ...current,
      query: '',
      categories: [],
      languages: [],
      author: '',
      networks: [...ALL_NETWORK_FILTERS],
      verified_only: false,
      sort_by: 'created_at',
      sort_order: 'desc',
      page: 1,
    }));

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove: () => void }> = [];

    if (debouncedQuery) {
      chips.push({
        id: 'query',
        label: `Search: ${debouncedQuery}`,
        onRemove: () => setFilters((current) => ({ ...current, query: '', page: 1 })),
      });
    }

    filters.categories.forEach((category) =>
      chips.push({
        id: `category:${category}`,
        label: `Category: ${category}`,
        onRemove: () =>
          setFilters((current) => ({
            ...current,
            categories: removeOne(current.categories, category),
            page: 1,
          })),
      }),
    );

    filters.languages.forEach((language) =>
      chips.push({
        id: `language:${language}`,
        label: `Language: ${language}`,
        onRemove: () =>
          setFilters((current) => ({
            ...current,
            languages: removeOne(current.languages, language),
            page: 1,
          })),
      }),
    );

    if (!isAllNetworksSelected(filters.networks)) {
      filters.networks.forEach((network) =>
        chips.push({
          id: `network:${network}`,
          label: `Network: ${network}`,
          onRemove: () =>
            setFilters((current) => ({
              ...current,
              networks: removeOne(current.networks, network),
              page: 1,
            })),
        }),
      );
    }

    if (filters.author) {
      chips.push({
        id: 'author',
        label: `Author: ${filters.author}`,
        onRemove: () => setFilters((current) => ({ ...current, author: '', page: 1 })),
      });
    }

    if (filters.verified_only) {
      chips.push({
        id: 'verified',
        label: 'Verified only',
        onRemove: () =>
          setFilters((current) => ({ ...current, verified_only: false, page: 1 })),
      });
    }

    if (filters.sort_by !== 'created_at' || filters.sort_order !== 'desc') {
      chips.push({
        id: 'sort',
        label: `Sort: ${filters.sort_by.replace('_', ' ')} (${filters.sort_order})`,
        onRemove: () => setFilters((current) => ({ ...current, sort_by: 'created_at', sort_order: 'desc' })),
      });
    }

    return chips;
  }, [debouncedQuery, filters]);

  const filterPanel = (
    <FilterPanel
      categories={CATEGORY_OPTIONS}
      selectedCategories={filters.categories}
      onToggleCategory={(value) =>
        setFilters((current) => ({
          ...current,
          categories: toggleOne(current.categories, value),
          page: 1,
        }))
      }
      languages={LANGUAGE_OPTIONS}
      selectedLanguages={filters.languages}
      onToggleLanguage={(value) =>
        setFilters((current) => ({
          ...current,
          languages: toggleOne(current.languages, value),
          page: 1,
        }))
      }
      author={filters.author}
      onAuthorChange={(value) =>
        setFilters((current) => ({ ...current, author: value, page: 1 }))
      }
      verifiedOnly={filters.verified_only}
      onVerifiedChange={(value) =>
        setFilters((current) => ({ ...current, verified_only: value, page: 1 }))
      }
    />
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">
          Browse Contracts
        </h1>
        <p className="text-muted-foreground">
          Discover verified Soroban smart contracts on the Stellar network
        </p>
      </div>

      <div className="bg-background rounded-xl border border-border p-6 mb-8 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="min-w-0 flex-1">
              <SearchBar
                value={filters.query}
                onChange={(value) => setFilters((current) => ({ ...current, query: value, page: 1 }))}
                onClear={() => {
                  logEvent('search_performed', {
                    keyword: '',
                    action: 'clear_query',
                  });
                  setFilters((current) => ({ ...current, query: '', page: 1 }));
                }}
              />
            </div>
            <NetworkSelectorDropdown
              selectedNetworks={filters.networks}
              onToggleNetwork={(value) =>
                setFilters((current) => ({
                  ...current,
                  networks: toggleOne(current.networks, value),
                  page: 1,
                }))
              }
              onSelectAll={() =>
                setFilters((current) => ({
                  ...current,
                  networks: [...ALL_NETWORK_FILTERS],
                  page: 1,
                }))
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SortDropdown
              value={filters.sort_by}
              onChange={(value) =>
                setFilters((current) => ({ ...current, sort_by: value, page: 1 }))
              }
              showRelevance={!!filters.query}
            />

            <select
              value={filters.sort_order}
              onChange={(e) => setFilters(prev => ({ ...prev, sort_order: e.target.value as 'asc' | 'desc', page: 1 }))}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>

            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="md:hidden inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </button>
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="w-4 h-4" />
              Advanced filters
            </div>
            {isFetching && !isLoading && (
              <span className="text-xs text-muted-foreground">
                Updating results...
              </span>
            )}
          </div>

          <ActiveFilters chips={activeFilterChips} onClearAll={clearAllFilters} />
        </div>

        <div className="hidden md:block mt-6 border-t border-border pt-6">
          {filterPanel}
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
          <div className="absolute right-0 top-0 h-full w-[88%] max-w-sm bg-background border-l border-border p-5 shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Filters</h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close filters"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {filterPanel}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="mt-6 w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
            >
              Show results
            </button>
          </div>
        </div>
      )}

      {!preferencesReady || isLoading ? (
        <>
          <div className="mb-4">
            <div className="h-6 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <ContractCardSkeleton key={i} />
            ))}
          </div>
        </>
      ) : effectiveData && effectiveData.items.length > 0 ? (
        <>
          <div className="mb-4">
            <ResultsCount visibleCount={effectiveData.items.length} totalCount={effectiveData.total} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {effectiveData.items.map((contract: Contract) => (
              <ContractCard key={contract.id} contract={contract} />
            ))}
          </div>

          {effectiveData.total_pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() =>
                  setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))
                }
                disabled={filters.page <= 1}
                className="px-4 py-2 rounded-lg border border-border text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
              >
                Previous
              </button>

              <span className="text-sm text-muted-foreground">
                Page {filters.page} of {effectiveData.total_pages}
              </span>

              <button
                onClick={() =>
                  setFilters((current) => ({ ...current, page: current.page + 1 }))
                }
                disabled={filters.page >= effectiveData.total_pages}
                className="px-4 py-2 rounded-lg border border-border text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 bg-background rounded-xl border border-border shadow-sm">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">
            No contracts found for the selected filters
          </p>
          <button
            type="button"
            onClick={() => {
              logEvent('search_performed', {
                keyword: '',
                action: 'clear_all_filters',
              });
              clearAllFilters();
            }}
            className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
