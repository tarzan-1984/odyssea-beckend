import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import {
	getLoadLocationAddressCandidates,
	PreferredLoadLocationType,
} from './tms-route-geocode-address.util';

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_DELAY_MS = 1100;

export type RouteGeocodeMarker = {
	lat: number;
	lng: number;
	addressLabel: string;
};

export type LoadRouteGeocodePayload = {
	pickup: RouteGeocodeMarker | null;
	delivery: RouteGeocodeMarker | null;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class TmsLoadRouteGeocodeService {
	private readonly logger = new Logger(TmsLoadRouteGeocodeService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly configService: ConfigService,
	) {}

	private nominatimUserAgent(): string {
		return (
			this.configService.get<string>('OSM_GEOCODER_USER_AGENT') ||
			'OdysseaTMSBackend/1.0 (+https://odysseia.com; load route geocoding)'
		);
	}

	/** Default US; override when address explicitly mentions Canada or Mexico. */
	private resolveNominatimCountryCodes(address: string): string {
		if (/\bcanada\b/i.test(address)) return 'ca';
		if (/\b(mexico|méxico)\b/i.test(address)) return 'mx';
		return 'us';
	}

	private async nominatimGeocode(
		query: string,
		countrycodes: string,
	): Promise<{ lat: number; lng: number } | null> {
		const url = new URL(NOMINATIM_SEARCH);
		url.searchParams.set('q', query);
		url.searchParams.set('format', 'json');
		url.searchParams.set('limit', '1');
		url.searchParams.set('addressdetails', '0');
		url.searchParams.set('accept-language', 'en');
		url.searchParams.set('countrycodes', countrycodes);

		try {
			const { data } = await axios.get<Array<{ lat?: string; lon?: string }>>(
				url.toString(),
				{
					timeout: 20000,
					headers: {
						'User-Agent': this.nominatimUserAgent(),
						Accept: 'application/json',
					},
				},
			);
			const first = data?.[0];
			if (!first?.lat || !first?.lon) return null;
			const lat = Number(first.lat);
			const lng = Number(first.lon);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
			return { lat, lng };
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			this.logger.warn(`Nominatim geocode failed for query="${query.slice(0, 80)}": ${msg}`);
			return null;
		}
	}

	private async geocodeFirstCandidate(
		candidates: string[],
	): Promise<{ lat: number; lng: number; addressLabel: string } | null> {
		for (let i = 0; i < candidates.length; i++) {
			if (i > 0) {
				await sleep(NOMINATIM_DELAY_MS);
			}
			const candidate = candidates[i];

			const trimmed = candidate.trim();
			const coords = await this.nominatimGeocode(
				trimmed,
				this.resolveNominatimCountryCodes(trimmed),
			);
			if (coords) {
				return { ...coords, addressLabel: candidate };
			}
		}
		return null;
	}

	private markersFromCacheRow(cache: {
		pickupLat: number | null;
		pickupLng: number | null;
		pickupGeocodeQuery: string | null;
		deliveryLat: number | null;
		deliveryLng: number | null;
		deliveryGeocodeQuery: string | null;
	}): LoadRouteGeocodePayload {
		const pickup =
			cache.pickupLat != null &&
			cache.pickupLng != null &&
			Number.isFinite(cache.pickupLat) &&
			Number.isFinite(cache.pickupLng)
				? {
						lat: cache.pickupLat,
						lng: cache.pickupLng,
						addressLabel: cache.pickupGeocodeQuery ?? 'Pick up',
					}
				: null;

		const delivery =
			cache.deliveryLat != null &&
			cache.deliveryLng != null &&
			Number.isFinite(cache.deliveryLat) &&
			Number.isFinite(cache.deliveryLng)
				? {
						lat: cache.deliveryLat,
						lng: cache.deliveryLng,
						addressLabel: cache.deliveryGeocodeQuery ?? 'Delivery',
					}
				: null;

		return { pickup, delivery };
	}

	async getRouteGeocodeForLoad(
		loadId: string,
		pickUpLocation: unknown,
		deliveryLocation: unknown,
	): Promise<LoadRouteGeocodePayload> {
		const trimmedLoadId = loadId.trim();
		if (!trimmedLoadId) {
			return { pickup: null, delivery: null };
		}

		const pickupCandidates = getLoadLocationAddressCandidates(
			pickUpLocation,
			'pick_up_location' satisfies PreferredLoadLocationType,
		);
		const deliveryCandidates = getLoadLocationAddressCandidates(
			deliveryLocation,
			'delivery_location' satisfies PreferredLoadLocationType,
		);

		if (pickupCandidates.length === 0 || deliveryCandidates.length === 0) {
			return { pickup: null, delivery: null };
		}

		const cached = await this.prisma.loadRouteGeocode.findUnique({
			where: { loadId: trimmedLoadId },
		});

		const needPickup =
			!cached ||
			cached.pickupLat == null ||
			cached.pickupLng == null ||
			!Number.isFinite(cached.pickupLat) ||
			!Number.isFinite(cached.pickupLng);

		const needDelivery =
			!cached ||
			cached.deliveryLat == null ||
			cached.deliveryLng == null ||
			!Number.isFinite(cached.deliveryLat) ||
			!Number.isFinite(cached.deliveryLng);

		if (!needPickup && !needDelivery && cached) {
			return this.markersFromCacheRow(cached);
		}

		let pickupResult: { lat: number; lng: number; addressLabel: string } | null = null;
		let deliveryResult: { lat: number; lng: number; addressLabel: string } | null = null;

		let didContactNominatimForPickup = false;
		if (!needPickup && cached) {
			pickupResult = this.markersFromCacheRow(cached).pickup;
		} else {
			pickupResult = await this.geocodeFirstCandidate(pickupCandidates);
			didContactNominatimForPickup = true;
			if (!pickupResult) {
				this.logger.warn(
					`Load route geocode: pickup failed load_id=${trimmedLoadId}`,
				);
			}
		}

		if (needDelivery && didContactNominatimForPickup) {
			await sleep(NOMINATIM_DELAY_MS);
		}

		if (!needDelivery && cached) {
			deliveryResult = this.markersFromCacheRow(cached).delivery;
		} else {
			deliveryResult = await this.geocodeFirstCandidate(deliveryCandidates);
			if (!deliveryResult) {
				this.logger.warn(
					`Load route geocode: delivery failed load_id=${trimmedLoadId}`,
				);
			}
		}

		const pickupLat = pickupResult?.lat ?? cached?.pickupLat ?? null;
		const pickupLng = pickupResult?.lng ?? cached?.pickupLng ?? null;
		const pickupGeocodeQuery =
			pickupResult?.addressLabel ?? cached?.pickupGeocodeQuery ?? null;
		const deliveryLat = deliveryResult?.lat ?? cached?.deliveryLat ?? null;
		const deliveryLng = deliveryResult?.lng ?? cached?.deliveryLng ?? null;
		const deliveryGeocodeQuery =
			deliveryResult?.addressLabel ?? cached?.deliveryGeocodeQuery ?? null;

		const payload: LoadRouteGeocodePayload = {
			pickup:
				pickupLat != null && pickupLng != null
					? {
							lat: pickupLat,
							lng: pickupLng,
							addressLabel: pickupGeocodeQuery ?? 'Pick up',
						}
					: null,
			delivery:
				deliveryLat != null && deliveryLng != null
					? {
							lat: deliveryLat,
							lng: deliveryLng,
							addressLabel: deliveryGeocodeQuery ?? 'Delivery',
						}
					: null,
		};

		if (
			pickupLat != null &&
			pickupLng != null &&
			deliveryLat != null &&
			deliveryLng != null
		) {
			await this.prisma.loadRouteGeocode.upsert({
				where: { loadId: trimmedLoadId },
				create: {
					loadId: trimmedLoadId,
					pickupLat,
					pickupLng,
					pickupGeocodeQuery: pickupGeocodeQuery ?? 'Pick up',
					deliveryLat,
					deliveryLng,
					deliveryGeocodeQuery: deliveryGeocodeQuery ?? 'Delivery',
				},
				update: {
					pickupLat,
					pickupLng,
					pickupGeocodeQuery: pickupGeocodeQuery ?? undefined,
					deliveryLat,
					deliveryLng,
					deliveryGeocodeQuery: deliveryGeocodeQuery ?? undefined,
				},
			});
		} else if (
			pickupLat != null ||
			pickupLng != null ||
			deliveryLat != null ||
			deliveryLng != null
		) {
			await this.prisma.loadRouteGeocode.upsert({
				where: { loadId: trimmedLoadId },
				create: {
					loadId: trimmedLoadId,
					pickupLat,
					pickupLng,
					pickupGeocodeQuery,
					deliveryLat,
					deliveryLng,
					deliveryGeocodeQuery,
				},
				update: {
					...(pickupLat != null ? { pickupLat } : {}),
					...(pickupLng != null ? { pickupLng } : {}),
					...(pickupGeocodeQuery != null ? { pickupGeocodeQuery } : {}),
					...(deliveryLat != null ? { deliveryLat } : {}),
					...(deliveryLng != null ? { deliveryLng } : {}),
					...(deliveryGeocodeQuery != null ? { deliveryGeocodeQuery } : {}),
				},
			});
		}

		return payload;
	}
}
