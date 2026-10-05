import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import {
  fetchTranscript,
  YoutubeTranscriptTooManyRequestError,
  type TranscriptResponse,
} from 'youtube-transcript';

const ANSWER_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You answer questions using only the supplied YouTube transcript excerpts.
If the excerpts do not contain enough information, say so rather than guessing.
When useful, refer to the timestamp shown in the transcript.`,
  ],
  [
    'human',
    'Question: {question}\n\nTranscript excerpts:\n{context}',
  ],
]);

@Injectable()
export class QuestionsService {
  constructor(private readonly configService: ConfigService) {}

  async handleQuestion(
    videoUrl: string,
    question: string,
  ): Promise<{
    status: string;
    videoId: string;
    question: string;
    answer: string;
    sources: string[];
  }> {
    const videoId = this.extractVideoId(videoUrl);
    console.log(`Extracted video ID from URL ${videoUrl}: ${videoId}`);
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Google Gemini is not configured. Set GOOGLE_API_KEY in the backend environment.',
      );
    }

    let transcript: TranscriptResponse[];
    try {
      transcript = await fetchTranscript(videoId);
      console.log(`Fetched transcript for YouTube video ${videoId}:`, transcript);
    } catch (error) {
      console.error(`Transcript fetch failed for YouTube video ${videoId}:`, error);

      if (error instanceof YoutubeTranscriptTooManyRequestError) {
        throw new ServiceUnavailableException(
          'YouTube is temporarily rate-limiting transcript requests. Please try again later.',
        );
      }

      throw new BadGatewayException(
        'Could not fetch this video transcript. Check that the video is available and has captions enabled.',
      );
    }

    const transcriptText = transcript
      .map((segment) => {
        // const timestamp = this.formatTimestamp(segment.offset);
        return `${segment.text}`;
      })
      .join('\n');

    console.log("transcriptText",transcriptText);
    if (!transcriptText.trim()) {
      throw new BadGatewayException('This video has no available transcript text.');
    }

    try {
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const documents = await splitter.createDocuments(
        [transcriptText],
        [{ videoId }],
      );
      console.log("My chunks are",documents[0].pageContent);
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey,
        modelName:
          this.configService.get<string>('GOOGLE_EMBEDDING_MODEL') ??
          'gemini-embedding-001',
      });
      const vectorStore = await MemoryVectorStore.fromDocuments(
        documents,
        embeddings,
      );
      const relevantDocuments = await vectorStore.similaritySearch(question, 5);

      if (relevantDocuments.length === 0) {
        throw new BadGatewayException(
          'Could not find relevant transcript excerpts for this question.',
        );
      }

      const context = relevantDocuments
        .map((document) => document.pageContent)
        .join('\n\n');
      const prompt = await ANSWER_PROMPT.invoke({ question, context });
      const chatModel = new ChatGoogleGenerativeAI({
        apiKey,
        model:
          this.configService.get<string>('GOOGLE_CHAT_MODEL') ??
          'gemini-2.5-flash',
        temperature: 0,
      });
      const response = await chatModel.invoke(prompt);
      const answer = this.getTextContent(response.content);

      if (!answer.trim()) {
        throw new BadGatewayException(
          'The language model returned an empty answer.',
        );
      }

      return {
        status: 'answered',
        videoId,
        question,
        answer,
        sources: relevantDocuments.map((document) => document.pageContent),
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      console.error(`Question answering failed for YouTube video ${videoId}:`, error);
      throw new BadGatewayException(
        'Could not generate an answer from this video. Check the Google Gemini configuration and try again.',
      );
    }
  }

  // private formatTimestamp(offsetSeconds: number): string {
  //   const totalSeconds = Math.floor(offsetSeconds);
  //   const minutes = Math.floor(totalSeconds / 60);
  //   const seconds = totalSeconds % 60;
  //   return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  // }

  private getTextContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (
            typeof part === 'object' &&
            part !== null &&
            'text' in part &&
            typeof part.text === 'string'
          ) {
            return part.text;
          }
          return '';
        })
        .join('');
    }

    throw new BadGatewayException(
      'The language model returned an unsupported response format.',
    );
  }

  private extractVideoId(videoUrl: string): string {
    console.log(`Extracting video ID from URL: ${videoUrl}`);
    let url: URL;

    try {
      url = new URL(videoUrl);
    } catch {
      throw new BadRequestException('Enter a valid YouTube video URL.');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new BadRequestException('YouTube URLs must use HTTP or HTTPS.');
    }

    const host = url.hostname.toLowerCase();
    const isShortLink = host === 'youtu.be' || host === 'www.youtu.be';
    const isYoutubeHost = [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com',
    ].includes(host);

    if (url.username || url.password || (!isShortLink && !isYoutubeHost)) {
      throw new BadRequestException('Enter a valid YouTube video URL.');
    }

    let videoId: string | null = null;

    if (isShortLink) {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else {
      videoId =
        url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/)?.[1] ?? null;
    }

    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
      throw new BadRequestException(
        'The YouTube URL does not contain a valid video ID.',
      );
    }

    return videoId;
  }
}
