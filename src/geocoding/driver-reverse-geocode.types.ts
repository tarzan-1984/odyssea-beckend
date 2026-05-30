export type DriverReverseGeocodeResult = {
	city: string;
	state: string;
	stateCode: string;
	zip: string;
	countryCode: string;
	source: 'geo_zips' | 'geo_reverse_cache' | 'here' | 'nominatim';
	match?: 'contains' | 'nearest';
};
