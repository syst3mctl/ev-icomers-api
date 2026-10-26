import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

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

    if (!(exception instanceof HttpException)) {
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

    return {
      type: 'about:blank#internal_error',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
    };
  }
}
