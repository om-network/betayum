import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsOptional,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateCodexAutomationRunDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  prompt: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  evidenceDescription: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  triggerWaitpointId?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  triggerRunId?: string;
}

export class CodexScreenshotReferenceDto {
  @IsString()
  @IsNotEmpty()
  objectKey: string;

  @IsString()
  @IsIn(['image/png', 'image/jpeg'])
  mimeType: string;

  @IsString()
  @IsNotEmpty()
  checksumSha256: string;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes: number;
}

export class CompleteCodexAutomationRunDto {
  @IsString()
  @MaxLength(20_000)
  summary: string;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CodexScreenshotReferenceDto)
  screenshots: CodexScreenshotReferenceDto[];
}

export class UploadCodexScreenshotDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsIn(['image/png', 'image/jpeg'])
  mimeType: string;

  @IsString()
  @IsNotEmpty()
  fileData: string;
}
