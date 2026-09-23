import type { Appointment, ServiceType, User } from '../types';


export interface AssignmentResult {
  estimatorId: string;
  reason: string;
  candidates: Array<{ id: string; name: string; conflicts: number; load: number }>;
}

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

/**
 * Smart assignment:
 *  1. Only active estimators capable of the service.
 *  2. Specialist services → specialist-qualified estimators only.
 *  3. Rank by conflicts at the requested slot, then by upcoming open load.
 */
export const assignEstimatorForService = (
  users: User[],
  appointments: Appointment[],
  serviceType: ServiceType,
  preferredDateTime: string,
  durationMinutes = 60,
  needsSpecialist = false,
): AssignmentResult => {
  const needsRenovation = needsSpecialist;
  const start = new Date(preferredDateTime);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const nowTs = Date.now();

  const pool = users.filter(
    (u) =>
      u.active &&
      u.role === 'ESTIMATOR' &&
      u.serviceCapabilities.includes(serviceType) &&
      (!needsRenovation || u.qualifiedForRenovation),
  );

  const fallback = users.find((u) => u.active && u.role === 'ESTIMATOR') || users.find((u) => u.role === 'OWNER');

  if (!pool.length) {
    return {
      estimatorId: fallback?.id || '',
      reason: 'No qualified estimator available — assigned to fallback for manual review.',
      candidates: [],
    };
  }

  const candidates = pool
    .map((u) => {
      const theirs = appointments.filter((a) => a.estimatorId === u.id && a.status !== 'CANCELLED' && a.status !== 'COMPLETED');
      const conflicts = theirs.filter((a) => overlaps(start, end, new Date(a.startTime), new Date(a.endTime))).length;
      const load = theirs.filter((a) => new Date(a.startTime).getTime() >= nowTs).length;
      return { id: u.id, name: u.name, conflicts, load };
    })
    .sort((a, b) => a.conflicts - b.conflicts || a.load - b.load || a.name.localeCompare(b.name));

  const best = candidates[0];
  const reason = `Auto-assigned to ${best.name}${needsRenovation ? ' (specialist-qualified)' : ''}: ${
    best.conflicts ? `${best.conflicts} conflict(s) at slot` : 'free at requested time'
  }, ${best.load} upcoming appointment(s).`;

  return { estimatorId: best.id, reason, candidates };
};
