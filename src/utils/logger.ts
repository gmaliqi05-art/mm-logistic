type LogContext = Record<string, unknown>;

const isDev = import.meta.env.DEV;
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let sentryReady = false;
type SentryLike = {
  captureMessage: (msg: string, opts?: unknown) => void;
  captureException: (err: unknown, opts?: unknown) => void;
};
let sentry: SentryLike | null = null;

async function initSentry() {
  if (sentryReady || !sentryDsn || isDev) return;
  sentryReady = true;
  try {
    const sentryPkg = '@sentry/browser';
    const mod = (await import(/* @vite-ignore */ sentryPkg).catch(() => null)) as
      | { init: (cfg: { dsn: string }) => void; captureMessage: SentryLike['captureMessage']; captureException: SentryLike['captureException'] }
      | null;
    if (mod) {
      mod.init({ dsn: sentryDsn });
      sentry = { captureMessage: mod.captureMessage, captureException: mod.captureException };
    }
  } catch {
    // Sentry optional; swallow errors silently in production
  }
}

initSentry();

function format(level: string, msg: string, ctx?: LogContext) {
  return ctx ? [level, msg, ctx] : [level, msg];
}

export const logger = {
  debug(msg: string, ctx?: LogContext) {
    if (isDev) console.debug(...format('[debug]', msg, ctx));
  },
  info(msg: string, ctx?: LogContext) {
    if (isDev) console.info(...format('[info]', msg, ctx));
    else sentry?.captureMessage(msg, { level: 'info', extra: ctx });
  },
  warn(msg: string, ctx?: LogContext) {
    if (isDev) console.warn(...format('[warn]', msg, ctx));
    else sentry?.captureMessage(msg, { level: 'warning', extra: ctx });
  },
  error(msg: string, ctx?: LogContext) {
    if (isDev) console.error(...format('[error]', msg, ctx));
    else {
      const err = ctx?.error;
      if (err instanceof Error) sentry?.captureException(err, { extra: { message: msg, ...ctx } });
      else sentry?.captureMessage(msg, { level: 'error', extra: ctx });
    }
  },
};
