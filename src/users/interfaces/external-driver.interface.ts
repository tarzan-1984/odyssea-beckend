export interface ExternalDriver {
  id: number;
  role: string;
  driver_name: string;
  driver_email: string;
  driver_phone: string;
  home_location: string;
  type: string;
  vin: string;
}

export interface ExternalApiResponse {
  success: boolean;
  data: ExternalDriver[];
  pagination: {
    current_page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
    has_next_page: boolean;
    has_prev_page: boolean;
  };
  filters: {
    status: string | null;
    search: string | null;
  };
  timestamp: string;
  api_version: string;
}
