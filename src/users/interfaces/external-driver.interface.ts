export interface ExternalDriver {
	id: number;
	role: string;
	driver_name: string;
	driver_email: string;
	driver_phone: string;
	home_location: string;
	type: string;
	vin: string;
	driver_status?: string; // Driver status (string)
	latitude?: string; // Latitude (comes as string)
	longitude?: string; // Longitude (comes as string)
	// New field from TMS: permission_view (used as company list in our DB).
	// In some payloads it can be nested under acf_fields.
	permission_view?: string[];
	acf_fields?: {
		permission_view?: string[];
	};
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
