export interface ColumnSchema {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "enum" | "boolean";
  values?: string[];
  format?: "currency" | "date" | "number";
  sortable: boolean;
  default_visible: boolean;
  default_sort?: "asc" | "desc";
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  default?: boolean;
  filters: Partial<FilterSpec>;
}

export interface FilterSpec {
  industry_groups?: string[];
  states?: string[];
  jurisdictions?: string[];
  entity_types?: string[];
  form_types?: string[];
  contact_roles?: string[];
  exclude_funds?: boolean;
  hide_board_contacts?: boolean;
  amount_sold_min?: number;
  amount_sold_max?: number;
  offering_amount_min?: number;
  offering_amount_max?: number;
  num_investors_min?: number;
  num_investors_max?: number;
  date_filed_from?: string;
  date_filed_to?: string;
  date_first_sale_from?: string;
  date_first_sale_to?: string;
  search?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export type LeadRow = Record<string, unknown>;

export interface LeadResponse {
  rows: LeadRow[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface HealthResponse {
  ready: boolean;
  filings_count: number;
  date_range: { first: string; last: string } | null;
}

export interface SchemaResponse {
  columns: ColumnSchema[];
  presets: Preset[];
}

export interface SummaryResponse {
  total_filings: number;
  unique_issuers: number;
  likely_funds: number;
  operating_companies: number;
  avg_offering: number;
  total_raised: number;
  median_raise: number;
  amendments: number;
  new_filings: number;
  first_date: string | null;
  last_date: string | null;
}
