import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';
import { UserRole, VehicleType, DistanceCoverage } from '@prisma/client';

describe('Users DTOs', () => {
  describe('CreateUserDto', () => {
    it('should validate valid create user data', async () => {
      const dto = new CreateUserDto();
      dto.email = 'test@example.com';
      dto.password = 'password123';
      dto.firstName = 'John';
      dto.lastName = 'Doe';
      dto.phone = '+1234567890';
      dto.role = UserRole.DRIVER;
      dto.language = ['en'];
      dto.vehicleType = VehicleType.CARGO_VAN;
      dto.hasPalletJack = false;
      dto.hasLiftGate = true;
      dto.hasCDL = true;
      dto.taxId = '12-3456789';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation for invalid email', async () => {
      const dto = new CreateUserDto();
      dto.email = 'invalid-email';
      dto.password = 'password123';
      dto.firstName = 'John';
      dto.lastName = 'Doe';
      dto.role = UserRole.DRIVER;
      dto.taxId = '12-3456789';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isEmail).toBeDefined();
    });

    it('should fail validation for short password', async () => {
      const dto = new CreateUserDto();
      dto.email = 'test@example.com';
      dto.password = '123';
      dto.firstName = 'John';
      dto.lastName = 'Doe';
      dto.role = UserRole.DRIVER;
      dto.taxId = '12-3456789';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.minLength).toBeDefined();
    });

    it('should fail validation for empty firstName', async () => {
      const dto = new CreateUserDto();
      dto.email = 'test@example.com';
      dto.password = 'password123';
      dto.firstName = '';
      dto.lastName = 'Doe';
      dto.role = UserRole.DRIVER;
      dto.taxId = '12-3456789';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should fail validation for empty lastName', async () => {
      const dto = new CreateUserDto();
      dto.email = 'test@example.com';
      dto.password = 'password123';
      dto.firstName = 'John';
      dto.lastName = '';
      dto.role = UserRole.DRIVER;
      dto.taxId = '12-3456789';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should fail validation for empty taxId', async () => {
      const dto = new CreateUserDto();
      dto.email = 'test@example.com';
      dto.password = 'password123';
      dto.firstName = 'John';
      dto.lastName = 'Doe';
      dto.role = UserRole.DRIVER;
      dto.taxId = '';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should fail validation for invalid role', async () => {
      const dto = new CreateUserDto();
      dto.email = 'test@example.com';
      dto.password = 'password123';
      dto.firstName = 'John';
      dto.lastName = 'Doe';
      dto.role = 'INVALID_ROLE' as UserRole;
      dto.taxId = '12-3456789';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isEnum).toBeDefined();
    });

    it('should validate optional fields correctly', async () => {
      const dto = new CreateUserDto();
      dto.email = 'test@example.com';
      dto.password = 'password123';
      dto.firstName = 'John';
      dto.lastName = 'Doe';
      dto.role = UserRole.DRIVER;
      dto.phone = '+1234567890';
      dto.language = ['en', 'es'];
      dto.vehicleType = VehicleType.SPRINTER_VAN;
      dto.vehicleCapacity = '1000 lbs';
      dto.vehicleDimensions = '10x8x6 ft';
      dto.vehicleModel = 'Sprinter 2500';
      dto.vehicleBrand = 'Mercedes-Benz';
      dto.vehicleYear = 2020;
      dto.distanceCoverage = DistanceCoverage.REGIONAL;
      dto.hasPalletJack = true;
      dto.hasLiftGate = false;
      dto.hasCDL = true;
      dto.hasTWIC = false;
      dto.hasTSA = true;
      dto.hasHazmatCert = false;
      dto.hasTankerEndorsement = true;
      dto.hasDolly = false;
      dto.hasCanada = true;
      dto.hasMexico = false;
      dto.hasETracks = true;
      dto.hasLoadBars = false;
      dto.hasRamp = true;
      dto.hasDockHigh = false;
      dto.hasPPE = true;
      dto.hasRealID = false;
      dto.hasPrinter = true;
      dto.hasSleeper = false;
      dto.taxId = '12-3456789';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('UpdateUserDto', () => {
    it('should validate valid update user data', async () => {
      const dto = new UpdateUserDto();
      dto.firstName = 'Jane';
      dto.lastName = 'Smith';
      dto.phone = '+0987654321';
      dto.role = UserRole.FLEET_MANAGER;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation for invalid email if provided', async () => {
      const dto = new UpdateUserDto();
      dto.email = 'invalid-email';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isEmail).toBeDefined();
    });

    it('should fail validation for short password if provided', async () => {
      const dto = new UpdateUserDto();
      dto.password = '123';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.minLength).toBeDefined();
    });

    it('should fail validation for invalid role if provided', async () => {
      const dto = new UpdateUserDto();
      dto.role = 'INVALID_ROLE' as UserRole;

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isEnum).toBeDefined();
    });

    it('should fail validation for invalid vehicle type if provided', async () => {
      const dto = new UpdateUserDto();
      dto.vehicleType = 'INVALID_TYPE' as VehicleType;

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isEnum).toBeDefined();
    });

    it('should fail validation for invalid distance coverage if provided', async () => {
      const dto = new UpdateUserDto();
      dto.distanceCoverage = 'INVALID_COVERAGE' as DistanceCoverage;

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isEnum).toBeDefined();
    });

    it('should validate all optional fields correctly', async () => {
      const dto = new UpdateUserDto();
      dto.firstName = 'Jane';
      dto.lastName = 'Smith';
      dto.phone = '+0987654321';
      dto.profilePhoto = 'https://example.com/photo.jpg';
      dto.role = UserRole.FLEET_MANAGER;
      dto.language = ['en', 'fr'];
      dto.extension = '123';
      dto.vehicleType = VehicleType.BOX_TRUCK;
      dto.vehicleCapacity = '2000 lbs';
      dto.vehicleDimensions = '12x8x8 ft';
      dto.vehicleModel = 'Box Truck 26';
      dto.vehicleBrand = 'Freightliner';
      dto.vehicleYear = 2019;
      dto.distanceCoverage = DistanceCoverage.OTR;
      dto.hasPalletJack = true;
      dto.hasLiftGate = true;
      dto.hasCDL = true;
      dto.hasTWIC = true;
      dto.hasTSA = true;
      dto.hasHazmatCert = true;
      dto.hasTankerEndorsement = true;
      dto.hasDolly = true;
      dto.hasCanada = true;
      dto.hasMexico = true;
      dto.hasETracks = true;
      dto.hasLoadBars = true;
      dto.hasRamp = true;
      dto.hasDockHigh = true;
      dto.hasPPE = true;
      dto.hasRealID = true;
      dto.hasPrinter = true;
      dto.hasSleeper = true;
      dto.taxId = '12-3456789';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate taxId field correctly', async () => {
      const dto = new UpdateUserDto();
      dto.taxId = '12-3456789';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
