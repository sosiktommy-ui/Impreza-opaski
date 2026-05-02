import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'string') {
        message = r;
      } else if (r && typeof r === 'object') {
        const obj = r as Record<string, unknown>;
        message = (obj.message as string) ?? message;
        code = (obj.code as string) ?? code;
        if (Array.isArray(obj.message)) message = obj.message.join('; ');
      }
      if (status === 400) code = 'VALIDATION_ERROR';
      else if (status === 401) code = 'UNAUTHORIZED';
      else if (status === 403) code = 'FORBIDDEN';
      else if (status === 404) code = 'NOT_FOUND';
      else if (status === 409) code = 'CONFLICT';
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`${req.method} ${req.url} → ${exception.message}`, exception.stack);
    }

    res.status(status).json({
      success: false,
      error: { code, message },
      timestamp: new Date().toISOString(),
    });
  }
}
