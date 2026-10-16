import { plainToInstance, Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsNumber()
  PORT: number;

  @IsString()
  MONGO_URI: string;

  @IsString()
  REDIS_HOST: string;

  @IsOptional()
  @IsNumber()
  REDIS_PORT?: number;

  @IsString()
  S3_BUCKET: string;

  @IsString()
  S3_REGION: string;

  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @Transform(({ obj }) => [true, 'true', '1'].includes(obj.S3_FORCE_PATH_STYLE))
  @IsBoolean()
  S3_FORCE_PATH_STYLE?: boolean;

  @IsString()
  S3_ACCESS_KEY_ID: string;

  @IsString()
  S3_SECRET_ACCESS_KEY: string;

  // the Origin header never has a path or trailing slash, so an entry with one would never match
  @IsOptional()
  @Transform(({ obj }) =>
    typeof obj.CORS_ORIGINS === 'string'
      ? obj.CORS_ORIGINS.split(',')
          .map((origin: string) => origin.trim())
          .filter(Boolean)
      : obj.CORS_ORIGINS
  )
  @IsArray()
  @Matches(/^https?:\/\/[^/\s]+$/, { each: true })
  CORS_ORIGINS?: string[];
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validated;
}
