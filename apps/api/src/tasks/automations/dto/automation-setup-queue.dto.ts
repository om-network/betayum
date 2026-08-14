import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum AutomationSetupOutcome {
  ready = 'ready',
  action_needed = 'action_needed',
  failed = 'failed',
}

export class StartAutomationSetupQueueDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  taskIds: string[];
}

export class ResetAutomationSetupQueueDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  automationIds: string[];
}

export class FinalizeAutomationSetupDto {
  @IsString()
  automationId: string;

  @IsEnum(AutomationSetupOutcome)
  outcome: AutomationSetupOutcome;

  @IsString()
  @MaxLength(2000)
  remarks: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  actionRequired?: string;
}
