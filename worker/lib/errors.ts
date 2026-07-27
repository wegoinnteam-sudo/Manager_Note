export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const Errors = {
  unauthorized: (message = "로그인이 필요합니다.") => new AppError(401, "unauthorized", message),
  forbidden: (message = "권한이 없습니다.") => new AppError(403, "forbidden", message),
  notFound: (message = "리소스를 찾을 수 없습니다.") => new AppError(404, "not_found", message),
  conflict: (message = "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.") =>
    new AppError(409, "conflict", message),
  badRequest: (message = "요청이 올바르지 않습니다.") => new AppError(400, "bad_request", message),
  payloadTooLarge: (message = "파일 크기가 허용 한도를 초과했습니다.") =>
    new AppError(413, "payload_too_large", message),
  unsupportedMedia: (message = "허용되지 않은 파일 형식입니다.") =>
    new AppError(415, "unsupported_media_type", message),
  tooManyRequests: (message = "요청이 너무 많습니다. 잠시 후 다시 시도하세요.") =>
    new AppError(429, "too_many_requests", message),
  internal: (message = "서버 오류가 발생했습니다.") => new AppError(500, "internal_error", message),
  upstream: (message = "외부 서비스 연동에 실패했습니다.") => new AppError(502, "upstream_error", message),
};
