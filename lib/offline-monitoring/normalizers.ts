const ARGENTINA_UTC_OFFSET_HOURS = 3;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1_000;

function decodeText(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function normalizeMonitoringCompanyName(value: string) {
  return decodeText(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("es-AR");
}

function buildArgentinaDate(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}) {
  const localTimestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  const validationDate = new Date(localTimestamp);

  if (
    validationDate.getUTCFullYear() !== parts.year ||
    validationDate.getUTCMonth() !== parts.month - 1 ||
    validationDate.getUTCDate() !== parts.day ||
    validationDate.getUTCHours() !== parts.hour ||
    validationDate.getUTCMinutes() !== parts.minute ||
    validationDate.getUTCSeconds() !== parts.second
  ) {
    return null;
  }

  return new Date(
    localTimestamp + ARGENTINA_UTC_OFFSET_HOURS * MILLISECONDS_PER_HOUR,
  );
}

export function parseCybermapaReportedAt(value: string) {
  const decodedValue = decodeText(value).trim();
  const isoMatch = decodedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/,
  );
  const localMatch = decodedValue.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/,
  );

  if (!isoMatch && !localMatch) {
    return null;
  }

  const values = isoMatch
    ? {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
        hour: Number(isoMatch[4]),
        minute: Number(isoMatch[5]),
        second: Number(isoMatch[6]),
        millisecond: Number((isoMatch[7] ?? "0").padEnd(3, "0")),
      }
    : {
        year: Number(localMatch![3]),
        month: Number(localMatch![2]),
        day: Number(localMatch![1]),
        hour: Number(localMatch![4]),
        minute: Number(localMatch![5]),
        second: Number(localMatch![6]),
        millisecond: Number((localMatch![7] ?? "0").padEnd(3, "0")),
      };

  if (
    values.hour > 23 ||
    values.minute > 59 ||
    values.second > 59 ||
    values.millisecond > 999
  ) {
    return null;
  }

  return buildArgentinaDate(values);
}

export function calculateOfflineHours(now: Date, lastReportedAt: Date) {
  return (now.getTime() - lastReportedAt.getTime()) / MILLISECONDS_PER_HOUR;
}
