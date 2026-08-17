import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGoogleSheetDto {
  @ApiProperty({
    description: 'Title for the Google Spreadsheet',
    example: 'GCP IAM Evidence - 2026-07-12',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    description: 'Header row values',
    example: ['Resource', 'Status', 'CollectedAt'],
  })
  @IsArray()
  @IsOptional()
  headers?: (string | number)[];

  @ApiProperty({
    description: 'Row data to write into the spreadsheet',
    example: [['projects/my-project', 'compliant', '2026-07-12T14:00:00Z']],
  })
  @IsArray()
  rows: (string | number)[][];
}

export class AppendGoogleSheetDto {
  @ApiPropertyOptional({
    description: 'Title to use for the task attachment snapshot',
    example: 'Access Review Log',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({
    description: 'Row data to append to the spreadsheet',
    example: [['projects/my-project', 'compliant', '2026-07-12T14:00:00Z']],
  })
  @IsArray()
  rows: (string | number)[][];
}
