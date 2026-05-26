import { IsObject, IsOptional } from 'class-validator';

/** Subset of TMS load meta_data needed for DB enrichment (drivers, route geocode). */
export class TmsLoadEnrichmentDto {
	@IsOptional()
	@IsObject()
	meta_data?: {
		attached_driver?: unknown;
		attached_second_driver?: unknown;
		attached_third_driver?: unknown;
		pick_up_location?: unknown;
		delivery_location?: unknown;
		[key: string]: unknown;
	};
}
