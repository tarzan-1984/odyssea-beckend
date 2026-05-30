export type GeoPostgisReverseGeocodeResult = {
	city: string;
	state: string;
	stateCode: string;
	zip: string;
	match: 'contains' | 'nearest';
};

export type GeoPostgisReverseGeocodeRow = {
	city: string | null;
	state: string | null;
	state_code: string | null;
	zip: string | null;
};
