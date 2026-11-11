/** One instance per request; names contain operation labels, never user data. */
export class RequestTiming {
  private started = performance.now();
  private spans: string[] = [];

  async measure<T>(
    name: string,
    operation: () => T | PromiseLike<T>,
  ): Promise<T> {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      this.spans.push(`${name};dur=${(performance.now() - start).toFixed(1)}`);
    }
  }

  response(response: Response) {
    response.headers.set(
      "Server-Timing",
      [
        ...this.spans,
        `total;dur=${(performance.now() - this.started).toFixed(1)}`,
      ].join(", "),
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
