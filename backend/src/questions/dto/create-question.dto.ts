import {
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  videoUrl!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'question must contain non-whitespace characters' })
  @MaxLength(4_900_000)
  question!: string;
}
