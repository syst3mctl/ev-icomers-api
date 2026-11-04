import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  isDatabaseUnavailable,
  prismaErrorCode,
} from '../../infra/prisma/prisma-errors.js';

/**
 * ყველა შეცდომა ბრუნდება ერთი ფორმატით: application/problem+json.
 * `code` მუდმივია — ფრონტი მასზე იღებს გადაწყვეტილებას; `detail` შეიძლება შეიცვალოს.
 * იხ. docs/05-api.md §1.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: unknown[];
  trace_id?: string;
}

/** ბიზნეს-შეცდომა მუდმივი კოდით, მაგ. `throw new AppError(409, 'OUT_OF_STOCK', '...')` */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    detail?: string,
    readonly errors?: unknown[],
  ) {
    super(detail ?? code, status);
  }
}

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    const body = this.toProblem(exception);
    if (req?.id) body.trace_id = String(req.id);

    if (body.code === 'DATABASE_UNAVAILABLE') {
      // ბაზის გათიშვისას ყოველი მოთხოვნა ერთ შეცდომას აგდებს. სრული stack trace
      // მხოლოდ იმ ფაილს აჩვენებს, საიდანაც query გავიდა — მიზეზს არა. ამიტომ ერთი
      // სტრიქონი დრაივერის კოდით: ლოგი იკითხება და მიზეზიც ჩანს.
      this.logger.warn(
        `503 DATABASE_UNAVAILABLE (${prismaErrorCode(exception) ?? 'unknown'})`,
      );
      // 503-ს `Retry-After` სჭირდება (RFC 9110 §15.6.4) — ფრონტმა იცოდეს, რამდენში გაიმეოროს
      res.setHeader('Retry-After', '5');
    } else if (!(exception instanceof HttpException)) {
      this.logger.error(exception);
    } else if (body.status >= 500) {
      this.logger.warn(`${body.status} ${body.code}: ${body.detail ?? ''}`);
    }

    res.status(body.status).type('application/problem+json').json(body);
  }

  toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof AppError) {
      return {
        type: `about:blank#${exception.code.toLowerCase()}`,
        title: exception.code,
        status: exception.getStatus(),
        code: exception.code,
        detail: exception.message,
        ...(exception.errors ? { errors: exception.errors } : {}),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && response && 'message' in response
          ? (response as { message: unknown }).message
          : exception.message;
      const code = STATUS_CODES[status] ?? `HTTP_${status}`;
      return {
        type: `about:blank#${code.toLowerCase()}`,
        title: exception.name,
        status,
        code,
        detail: Array.isArray(message) ? message.join('; ') : String(message),
        ...(Array.isArray(message) ? { errors: message } : {}),
      };
    }

    // ბაზა მიუწვდომელია — ეს ინფრასტრუქტურის და არა მოთხოვნის პრობლემაა. ფრონტი
    // `code`-ით ხვდება, რომ უნდა აჩვენოს „დროებით მიუწვდომელია“ და არა ზოგადი
    // შეცდომა, ხოლო მოთხოვნის გამეორებას აზრი აქვს. Prisma-ს `detail` არ გადმოგვაქვს:
    // ის შეიცავს კოდის გზას და SQL-ის ფრაგმენტს.
    if (isDatabaseUnavailable(exception)) {
      return {
        type: 'about:blank#database_unavailable',
        title: 'DATABASE_UNAVAILABLE',
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'DATABASE_UNAVAILABLE',
        detail: 'The database is temporarily unavailable. Try again shortly.',
      };
    }

    return {
      type: 'about:blank#internal_error',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
    };
  }
}
