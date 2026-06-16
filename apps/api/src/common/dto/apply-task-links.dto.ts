import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class ApplyTaskLinksDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  taskIds!: string[];

  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}
