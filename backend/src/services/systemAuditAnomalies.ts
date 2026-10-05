type AuditFailure = {
  actorIp?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  event: string;
  statusCode: number;
  createdAt: Date;
};

export type SystemAuditAnomaly = {
  type: 'repeated_auth_failures' | 'repeated_forbidden_access';
  count: number;
  threshold: number;
  windowMinutes: 15;
  actorIp: string;
  actorName?: string;
  actorRole?: string;
  latestAt: string;
};

export const SYSTEM_AUDIT_ALERT_WINDOW_MS = 15 * 60 * 1000;
export const SYSTEM_AUDIT_AUTH_FAILURE_THRESHOLD = 5;
export const SYSTEM_AUDIT_FORBIDDEN_THRESHOLD = 5;

function actorKey(entry: AuditFailure) {
  return entry.actorIp?.trim() || '';
}

export function detectSystemAuditAnomalies(entries: readonly AuditFailure[]): SystemAuditAnomaly[] {
  const groups = new Map<string, { type: SystemAuditAnomaly['type']; entries: AuditFailure[] }>();
  for (const entry of entries) {
    const actorIp = actorKey(entry);
    if (!actorIp) continue;
    const authFailure =
      entry.statusCode === 401 &&
      /^POST \/auth\/(?:login|verify-login|register)(?:\s|$)/i.test(entry.event);
    const forbiddenAccess = entry.statusCode === 403;
    if (!authFailure && !forbiddenAccess) continue;
    const type = authFailure ? 'repeated_auth_failures' : 'repeated_forbidden_access';
    const key = type + ':' + actorIp;
    const group = groups.get(key) ?? { type, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .flatMap(([key, group]) => {
      const threshold =
        group.type === 'repeated_auth_failures'
          ? SYSTEM_AUDIT_AUTH_FAILURE_THRESHOLD
          : SYSTEM_AUDIT_FORBIDDEN_THRESHOLD;
      if (group.entries.length < threshold) return [];
      const latest = group.entries.reduce((current, entry) =>
        entry.createdAt > current.createdAt ? entry : current,
      );
      const actorIp = key.slice(key.indexOf(':') + 1);
      return [
        {
          type: group.type,
          count: group.entries.length,
          threshold,
          windowMinutes: 15 as const,
          actorIp,
          ...(latest.actorName ? { actorName: latest.actorName } : {}),
          ...(latest.actorRole ? { actorRole: latest.actorRole } : {}),
          latestAt: latest.createdAt.toISOString(),
        },
      ];
    })
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}
