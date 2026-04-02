/**
 * TMS `current_location` expects US/CA/MX region codes as in the admin dropdown
 * (e.g. NY, MD, ON, BC), not full state names from geocoders.
 */

/** Valid option values from TMS `current_location` select (US + Canada + Mexico). */
const TMS_LOCATION_CODES = new Set<string>([
	// United States
	'AL',
	'AK',
	'AZ',
	'AR',
	'CA',
	'CO',
	'CT',
	'DE',
	'DC',
	'FL',
	'GA',
	'HI',
	'ID',
	'IL',
	'IN',
	'IA',
	'KS',
	'KY',
	'LA',
	'ME',
	'MD',
	'MA',
	'MI',
	'MN',
	'MS',
	'MO',
	'MT',
	'NE',
	'NV',
	'NH',
	'NJ',
	'NM',
	'NY',
	'NC',
	'ND',
	'OH',
	'OK',
	'OR',
	'PA',
	'RI',
	'SC',
	'SD',
	'TN',
	'TX',
	'UT',
	'VT',
	'VA',
	'WA',
	'WV',
	'WI',
	'WY',
	// Canada
	'AB',
	'BC',
	'MB',
	'NB',
	'NL',
	'NT',
	'NS',
	'NU',
	'ON',
	'PE',
	'QC',
	'SK',
	'YT',
	// Mexico
	'DIF',
	'CDMX',
	'AGU',
	'BCN',
	'BCS',
	'CAM',
	'CHP',
	'CHIS',
	'CHH',
	'COA',
	'COL',
	'DUR',
	'GUA',
	'GRO',
	'HID',
	'JAL',
	'MIC',
	'MOR',
	'MEX',
	'NAY',
	'NLE',
	'OAX',
	'PUE',
	'QUE',
	'QRO',
	'NAQ',
	'ROO',
	'SLP',
	'SIN',
	'SON',
	'TAB',
	'TAM',
	'TLA',
	'VER',
	'YUC',
	'ZAC',
]);

/**
 * Normalized lookup key: lowercase letters only (ASCII), no spaces/punctuation.
 * Maps English (and common) region names to TMS codes.
 */
const NAME_TO_CODE: Record<string, string> = (() => {
	const m: Record<string, string> = {
		// US — full names
		alabama: 'AL',
		alaska: 'AK',
		arizona: 'AZ',
		arkansas: 'AR',
		california: 'CA',
		colorado: 'CO',
		connecticut: 'CT',
		delaware: 'DE',
		districtofcolumbia: 'DC',
		florida: 'FL',
		georgia: 'GA',
		hawaii: 'HI',
		idaho: 'ID',
		illinois: 'IL',
		indiana: 'IN',
		iowa: 'IA',
		kansas: 'KS',
		kentucky: 'KY',
		louisiana: 'LA',
		maine: 'ME',
		maryland: 'MD',
		massachusetts: 'MA',
		michigan: 'MI',
		minnesota: 'MN',
		mississippi: 'MS',
		missouri: 'MO',
		montana: 'MT',
		nebraska: 'NE',
		nevada: 'NV',
		newhampshire: 'NH',
		newjersey: 'NJ',
		newmexico: 'NM',
		newyork: 'NY',
		northcarolina: 'NC',
		northdakota: 'ND',
		ohio: 'OH',
		oklahoma: 'OK',
		oregon: 'OR',
		pennsylvania: 'PA',
		rhodeisland: 'RI',
		southcarolina: 'SC',
		southdakota: 'SD',
		tennessee: 'TN',
		texas: 'TX',
		utah: 'UT',
		vermont: 'VT',
		virginia: 'VA',
		washington: 'WA',
		westvirginia: 'WV',
		wisconsin: 'WI',
		wyoming: 'WY',
		// US — codes as typed lowercase
		al: 'AL',
		ak: 'AK',
		az: 'AZ',
		ar: 'AR',
		ca: 'CA',
		co: 'CO',
		ct: 'CT',
		de: 'DE',
		dc: 'DC',
		fl: 'FL',
		ga: 'GA',
		hi: 'HI',
		id: 'ID',
		il: 'IL',
		in: 'IN',
		ia: 'IA',
		ks: 'KS',
		ky: 'KY',
		la: 'LA',
		me: 'ME',
		md: 'MD',
		ma: 'MA',
		mi: 'MI',
		mn: 'MN',
		ms: 'MS',
		mo: 'MO',
		mt: 'MT',
		ne: 'NE',
		nv: 'NV',
		nh: 'NH',
		nj: 'NJ',
		nm: 'NM',
		ny: 'NY',
		nc: 'NC',
		nd: 'ND',
		oh: 'OH',
		ok: 'OK',
		or: 'OR',
		pa: 'PA',
		ri: 'RI',
		sc: 'SC',
		sd: 'SD',
		tn: 'TN',
		tx: 'TX',
		ut: 'UT',
		vt: 'VT',
		va: 'VA',
		wa: 'WA',
		wv: 'WV',
		wi: 'WI',
		wy: 'WY',
		// Canada
		alberta: 'AB',
		britishcolumbia: 'BC',
		manitoba: 'MB',
		newbrunswick: 'NB',
		newfoundlandandlabrador: 'NL',
		northwestterritories: 'NT',
		novascotia: 'NS',
		nunavut: 'NU',
		ontario: 'ON',
		princeedwardisland: 'PE',
		quebec: 'QC',
		saskatchewan: 'SK',
		yukon: 'YT',
		ab: 'AB',
		bc: 'BC',
		mb: 'MB',
		nb: 'NB',
		nl: 'NL',
		nt: 'NT',
		ns: 'NS',
		nu: 'NU',
		on: 'ON',
		pe: 'PE',
		qc: 'QC',
		sk: 'SK',
		yt: 'YT',
		// Mexico (common names → TMS codes from dropdown)
		distritofederal: 'CDMX',
		aguascalientes: 'AGU',
		bajacalifornia: 'BCN',
		bajacaliforniasur: 'BCS',
		campeche: 'CAM',
		chiapas: 'CHP',
		chihuahua: 'CHH',
		coahuila: 'COA',
		colima: 'COL',
		durango: 'DUR',
		guanajuato: 'GUA',
		guerrero: 'GRO',
		hidalgo: 'HID',
		jalisco: 'JAL',
		michoacan: 'MIC',
		michoacán: 'MIC',
		morelos: 'MOR',
		mexico: 'MEX',
		méxico: 'MEX',
		nayarit: 'NAY',
		nuevoleon: 'NLE',
		nuevoléon: 'NLE',
		oaxaca: 'OAX',
		puebla: 'PUE',
		queretaro: 'QUE',
		querétaro: 'QUE',
		quintanaroo: 'ROO',
		sanluispotosi: 'SLP',
		sanluispotosí: 'SLP',
		sinaloa: 'SIN',
		sonora: 'SON',
		tabasco: 'TAB',
		tamaulipas: 'TAM',
		tlaxcala: 'TLA',
		veracruz: 'VER',
		yucatan: 'YUC',
		yucatán: 'YUC',
		zacatecas: 'ZAC',
	};
	return m;
})();

const DEFAULT_CODE = 'NY';

function lettersOnlyKey(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/[^a-z]/g, '');
}

/**
 * Maps free-text state/region (from DB, Nominatim, mobile) to TMS `current_location` code.
 */
export function normalizeTmsCurrentLocation(
	raw: string | null | undefined,
): string {
	if (raw == null) {
		return DEFAULT_CODE;
	}
	const trimmed = raw.trim();
	if (!trimmed) {
		return DEFAULT_CODE;
	}

	const upper = trimmed.toUpperCase();
	const lettersOnly = upper.replace(/[^A-Z0-9]/g, '');

	// Already a valid TMS code (2–4 chars, e.g. NY, MD, CDMX)
	if (lettersOnly.length >= 2 && lettersOnly.length <= 4) {
		if (TMS_LOCATION_CODES.has(lettersOnly)) {
			return lettersOnly;
		}
	}

	// Trailing code: "City, MD" or "… MD"
	const tail = upper.match(/\b([A-Z]{2})\s*$/);
	if (tail && TMS_LOCATION_CODES.has(tail[1])) {
		return tail[1];
	}
	const tailMx = upper.match(/\b([A-Z]{3,4})\s*$/);
	if (tailMx && TMS_LOCATION_CODES.has(tailMx[1])) {
		return tailMx[1];
	}

	const key = lettersOnlyKey(trimmed);
	if (key && NAME_TO_CODE[key]) {
		return NAME_TO_CODE[key];
	}

	const first = trimmed.split(/[\s,]+/)[0];
	if (first) {
		const k2 = lettersOnlyKey(first);
		if (k2 && NAME_TO_CODE[k2]) {
			return NAME_TO_CODE[k2];
		}
	}

	return DEFAULT_CODE;
}
