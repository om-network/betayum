import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateGoogleDocDto {
  @ApiProperty({
    description: 'Title for the Google Doc',
    example: 'GCP IAM Evidence - 2026-07-12',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Initial content to write into the document',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class AppendGoogleDocDto {
  @ApiProperty({
    description: 'Content to append to the document',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}
