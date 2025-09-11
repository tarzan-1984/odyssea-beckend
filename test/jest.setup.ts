import 'reflect-metadata';

// Mock Swagger decorators to prevent errors during testing
jest.mock('@nestjs/swagger', () => ({
	ApiProperty: jest.fn(() => jest.fn()),
	ApiOperation: jest.fn(() => jest.fn()),
	ApiResponse: jest.fn(() => jest.fn()),
	ApiQuery: jest.fn(() => jest.fn()),
	ApiTags: jest.fn(() => jest.fn()),
	ApiBearerAuth: jest.fn(() => jest.fn()),
	ApiParam: jest.fn(() => jest.fn()),
	ApiBody: jest.fn(() => jest.fn()),
	ApiHeader: jest.fn(() => jest.fn()),
	ApiCookieAuth: jest.fn(() => jest.fn()),
	ApiExcludeController: jest.fn(() => jest.fn()),
	ApiExcludeEndpoint: jest.fn(() => jest.fn()),
	ApiExtraModels: jest.fn(() => jest.fn()),
	ApiHideProperty: jest.fn(() => jest.fn()),
	ApiOkResponse: jest.fn(() => jest.fn()),
	ApiCreatedResponse: jest.fn(() => jest.fn()),
	ApiAcceptedResponse: jest.fn(() => jest.fn()),
	ApiNoContentResponse: jest.fn(() => jest.fn()),
	ApiMovedPermanentlyResponse: jest.fn(() => jest.fn()),
	ApiFoundResponse: jest.fn(() => jest.fn()),
	ApiBadRequestResponse: jest.fn(() => jest.fn()),
	ApiUnauthorizedResponse: jest.fn(() => jest.fn()),
	ApiForbiddenResponse: jest.fn(() => jest.fn()),
	ApiNotFoundResponse: jest.fn(() => jest.fn()),
	ApiMethodNotAllowedResponse: jest.fn(() => jest.fn()),
	ApiNotAcceptableResponse: jest.fn(() => jest.fn()),
	ApiRequestTimeoutResponse: jest.fn(() => jest.fn()),
	ApiConflictResponse: jest.fn(() => jest.fn()),
	ApiGoneResponse: jest.fn(() => jest.fn()),
	ApiPayloadTooLargeResponse: jest.fn(() => jest.fn()),
	ApiUnsupportedMediaTypeResponse: jest.fn(() => jest.fn()),
	ApiUnprocessableEntityResponse: jest.fn(() => jest.fn()),
	ApiInternalServerErrorResponse: jest.fn(() => jest.fn()),
	ApiNotImplementedResponse: jest.fn(() => jest.fn()),
	ApiBadGatewayResponse: jest.fn(() => jest.fn()),
	ApiServiceUnavailableResponse: jest.fn(() => jest.fn()),
	ApiGatewayTimeoutResponse: jest.fn(() => jest.fn()),
	ApiDefaultResponse: jest.fn(() => jest.fn()),
	PartialType: jest.fn((dto: any) => dto),
	OmitType: jest.fn((dto: any, _keys: any) => dto),
	PickType: jest.fn((dto: any, _keys: any) => dto),
	IntersectionType: jest.fn((...dtos: any[]) => dtos[0]),
	ApiConsumes: jest.fn(() => jest.fn()),
	ApiProduces: jest.fn(() => jest.fn()),
	ApiSecurity: jest.fn(() => jest.fn()),
	ApiUseTags: jest.fn(() => jest.fn()),
}));

// Global test setup
beforeAll(() => {
	// Any global setup can go here
});

afterAll(() => {
	// Any global cleanup can go here
});
