import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TmsLoadDetailsService } from './tms-load-details.service';
import { TmsLoadRouteGeocodeService } from './tms-load-route-geocode.service';
import type { TmsShipperLike } from './tms-route-geocode-address.util';

type LoadEnrichmentDriver = {
	id: string;
	externalId: string | null;
	email: string | null;
	firstName: string | null;
	lastName: string | null;
	phone: string | null;
	profilePhoto: string | null;
	role: string;
	status: string;
	driverStatus: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	latitude: number | null;
	longitude: number | null;
	lastLocationUpdateAt: string | null;
	lastActiveApp: Date | null;
	isTracking: boolean;
	trackingLoadId: string | null;
};

function normalizeExternalIdValue(value: unknown): string {
	if (typeof value === 'string' || typeof value === 'number') {
		return String(value).trim();
	}
	return '';
}

@Injectable()
export class TmsLoadTrackingService {
	constructor(
		private readonly tmsLoadDetailsService: TmsLoadDetailsService,
		private readonly tmsLoadRouteGeocodeService: TmsLoadRouteGeocodeService,
		private readonly prisma: PrismaService,
	) {}

	async getLoadMapPayload(loadId: string) {
		const cleanLoadId = loadId.trim();
		if (!cleanLoadId) {
			return { success: false, data: null };
		}

		const loadDetails =
			await this.tmsLoadDetailsService.fetchLoadDetails(cleanLoadId);
		if (!loadDetails?.data) {
			return { success: false, data: null };
		}

		const enrichment = await this.buildLoadEnrichment(
			cleanLoadId,
			loadDetails.data.meta_data ?? {},
			Array.isArray(loadDetails.data.shippers)
				? (loadDetails.data.shippers as TmsShipperLike[])
				: undefined,
		);

		return {
			success: loadDetails.success ?? true,
			data: {
				...loadDetails.data,
				...enrichment,
			},
		};
	}

	async buildLoadEnrichment(
		loadId: string,
		metaData: {
			attached_driver?: unknown;
			attached_second_driver?: unknown;
			attached_third_driver?: unknown;
			pick_up_location?: unknown;
			delivery_location?: unknown;
		},
		shippers?: TmsShipperLike[] | null,
	) {
		const driverExternalIds = [
			metaData?.attached_driver,
			metaData?.attached_second_driver,
			metaData?.attached_third_driver,
		]
			.map((value) => normalizeExternalIdValue(value))
			.filter(Boolean);

		const uniqueDriverExternalIds = Array.from(new Set(driverExternalIds));
		const driversPromise: Promise<LoadEnrichmentDriver[]> =
			uniqueDriverExternalIds.length > 0
				? this.prisma.user.findMany({
						where: {
							externalId: {
								in: uniqueDriverExternalIds,
							},
						},
						select: {
							id: true,
							externalId: true,
							email: true,
							firstName: true,
							lastName: true,
							phone: true,
							profilePhoto: true,
							role: true,
							status: true,
							driverStatus: true,
							city: true,
							state: true,
							zip: true,
							latitude: true,
							longitude: true,
							lastLocationUpdateAt: true,
							lastActiveApp: true,
							isTracking: true,
							trackingLoadId: true,
						},
					})
				: Promise.resolve([]);
		const trackingPointsPromise = this.prisma.driverTracking.findMany({
			where: { loadId },
			select: {
				id: true,
				externalDriverId: true,
				latitude: true,
				longitude: true,
				placeLabel: true,
				deviceId: true,
				deviceModel: true,
				deviceName: true,
				devicePlatform: true,
				createdAt: true,
				updatedAt: true,
			},
			orderBy: { createdAt: 'asc' },
		});
		const routeGeocodePromise =
			this.tmsLoadRouteGeocodeService.getRouteGeocodeForLoad(
				loadId,
				metaData?.pick_up_location,
				metaData?.delivery_location,
				shippers,
			);

		const [drivers, trackingPoints, routeGeocode] = await Promise.all([
			driversPromise,
			trackingPointsPromise,
			routeGeocodePromise,
		]);

		const driversByExternalId = new Map(
			drivers
				.filter((driver) => driver.externalId)
				.map(
					(driver) => [driver.externalId as string, driver] as const,
				),
		);

		return {
			drivers: uniqueDriverExternalIds
				.map((externalId) => {
					const driver = driversByExternalId.get(externalId);
					if (!driver) return null;
					return {
						...driver,
						lastActiveApp:
							driver.lastActiveApp?.toISOString() ?? null,
					};
				})
				.filter((driver): driver is NonNullable<typeof driver> =>
					Boolean(driver),
				),
			trackingPoints,
			routeGeocode,
		};
	}
}
