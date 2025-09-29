export interface ExternalUser {
  id: number;
  user_email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  roles: string[];
  user_registered: string;
  acf_fields: {
    permission_view: string[];
    initials_color: string;
    work_location: string;
    phone_number: string | null;
    flt: boolean | null;
  };
}

export interface ExternalUserPagination {
  current_page: string;
  per_page: string;
  total_users: number;
  total_pages: number;
}

export interface ExternalUserApiResponse {
  success: boolean;
  data: ExternalUser[];
  pagination: ExternalUserPagination;
  timestamp: string;
  api_version: string;
}
