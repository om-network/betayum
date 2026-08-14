import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
} from 'class-validator';
import { AutomationSetupStatus, TaskFrequency } from '@db';

export class UpdateAutomationDto {
  @ApiProperty({
    description: 'Automation name',
    example: 'GitHub Security Check - Evidence Collection',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Automation description',
    example: 'Collects evidence about GitHub repository security settings',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Whether the automation is enabled',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @ApiProperty({
    description: 'Evaluation criteria for the automation',
    required: false,
  })
  @IsString()
  @IsOptional()
  evaluationCriteria?: string;

  @ApiPropertyOptional({
    enum: TaskFrequency,
    description: 'Automation schedule cadence',
  })
  @IsEnum(TaskFrequency)
  @IsOptional()
  scheduleFrequency?: TaskFrequency;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Tool names the AI may use during chat (e.g. promptForSecret, promptForInfo). Null means all tools are allowed.',
    example: ['promptForSecret', 'promptForInfo'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedTools?: string[];

  @ApiPropertyOptional({
    enum: AutomationSetupStatus,
    description: 'Current state of automated setup performed by the AI queue',
  })
  @IsEnum(AutomationSetupStatus)
  @IsOptional()
  setupStatus?: AutomationSetupStatus;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Specific information or intervention required from the user to continue setup',
  })
  @IsString()
  @IsOptional()
  setupTask?: string | null;
}
