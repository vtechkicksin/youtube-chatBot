import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionsService } from './questions.service';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async createQuestion(
    @Body() createQuestionDto: CreateQuestionDto,
  ): Promise<{
    status: string;
    videoId: string;
    question: string;
    answer: string;
    sources: string[];
  }> {
    console.log('Received question request:', createQuestionDto);
    return this.questionsService.handleQuestion(
      createQuestionDto.videoUrl,
      createQuestionDto.question,
    );
  }
}
