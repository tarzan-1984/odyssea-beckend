export type HereRevgeocodeAddress = {
	label: string;
	street: string;
	houseNumber: string;
	city: string;
	state: string;
	stateCode: string;
	postalCode: string;
	countryCode: string;
	countryName: string;
};

export type HereRevgeocodeResult = {
	title: string;
	resultType: string;
	position: { lat: number; lng: number };
	address: HereRevgeocodeAddress;
};

export type HereRevgeocodeApiResponse = {
	items?: Array<{
		title?: string;
		resultType?: string;
		position?: { lat?: number; lng?: number };
		address?: {
			label?: string;
			street?: string;
			houseNumber?: string;
			city?: string;
			state?: string;
			stateCode?: string;
			postalCode?: string;
			countryCode?: string;
			countryName?: string;
			county?: string;
			district?: string;
		};
	}>;
};
