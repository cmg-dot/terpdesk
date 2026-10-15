export interface Slot {
  id: string;
  active: boolean;
  reservedBy: string | null;
  interpreterName?: string;
  needsReplacement: boolean;
  followUp: boolean;
}

export interface Offer {
  id: string;
  slotId: string;
  interpreterId: string;
  state: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  expiresAt: number | string;
}

export interface Appointment {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  state: 'draft' | 'cancelled' | 'active';
  slots: Slot[];
  offers: Offer[];
  [key: string]: any; // Allow other properties for legacy data support
}

export function formatReference(id?: string): string {
  if (!id) return "APT-PENDING";
  if (id.startsWith("APT-")) return id;
  const clean = id.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `APT-${clean}`;
}

export function isNeedsReplacementStatus(status?: string | null): boolean {
  return !!status && status.toLowerCase().replace(/[\s_-]+/g, '') === 'needsreplacement';
}

/** True when an offer is pending, not expired, and the appointment has not ended. */
export function hasLivePendingOffer(appointment: Appointment, now: number = Date.now()): boolean {
  const isPastEnd = appointment.endsAt ? now > new Date(appointment.endsAt).getTime() : false;
  if (isPastEnd) return false;
  return (
    (appointment.offers || []).some((o: any) =>
      (o.state === 'pending' || o.status === 'pending') &&
      o.state !== 'expired' &&
      o.status !== 'expired' &&
      new Date(o.expiresAt).getTime() > now,
    ) ||
    appointment.pendingOffer === true ||
    Boolean(appointment.status?.toLowerCase().includes('awaiting response'))
  );
}

export function getStaffingRatio(appointment: Appointment) {
  const totalSlots = appointment.totalPositions || appointment.slotCount || (appointment.requiredPositions || (appointment.positions === "Team — two independent positions" ? 2 : 1));
  const activeSlots = appointment.slots?.filter(s => s.active) || [];

  let bookedSlots: Slot[] = [];
  if (activeSlots.length > 0) {
    bookedSlots = activeSlots.filter(s => s.reservedBy !== null);
  }

  // Check offers for accepted state if bookedSlots has fewer
  if (appointment.offers && Array.isArray(appointment.offers)) {
    const acceptedOffers = appointment.offers.filter(
      (o: any) => o.status === 'accepted' || o.state === 'accepted'
    );
    if (acceptedOffers.length > bookedSlots.length) {
      bookedSlots = acceptedOffers.map((o: any, idx: number) => ({
        id: o.id || `accepted-offer-${idx}`,
        active: true,
        reservedBy: o.interpreterId || 'interpreter',
        interpreterName: o.interpreterName || 'Booked',
        needsReplacement: false,
        followUp: false
      }));
    }
  }

  let bookedCount = appointment.staffedCount !== undefined 
    ? appointment.staffedCount 
    : (bookedSlots.length || (appointment.acceptedInterpretersCount || 0));

  const statusLower = (appointment.status || appointment.requestStatus || '').toLowerCase();
  const isBookedOrAssigned = 
    appointment.hasAcceptedOffer === true ||
    statusLower === 'assigned' ||
    statusLower === 'booked' ||
    statusLower === 'fully_staffed' ||
    statusLower === 'fully staffed';

  if (bookedCount === 0 && isBookedOrAssigned) {
    bookedCount = 1;
    if (bookedSlots.length === 0) {
      bookedSlots = [{
        id: 'assigned-slot',
        active: true,
        reservedBy: appointment.assignedInterpreterId || 'assigned',
        interpreterName: appointment.assignedInterpreterName || (statusLower === 'booked' ? 'Booked' : 'Assigned'),
        needsReplacement: false,
        followUp: false
      }];
    }
  }

  const isAllFilled = bookedCount >= totalSlots && totalSlots > 0;
  // A live offer means the open position is being addressed, so a stale "Needs replacement" status is ignored.
  const isReplacement = !isAllFilled && (
    (isNeedsReplacementStatus(appointment.status) && !hasLivePendingOffer(appointment)) ||
    activeSlots.some(s => s.needsReplacement && !s.reservedBy)
  );

  return { bookedCount, totalSlots, bookedSlots, isReplacement };
}

export function getStaffingLabel(appointment: Appointment, now: number = Date.now()): string {
  if (appointment.state === 'cancelled' || appointment.status?.toLowerCase() === 'cancelled') {
    return 'Cancelled';
  }
  
  const { bookedCount, totalSlots, isReplacement } = getStaffingRatio(appointment);
  const filters = getStatusFilters(appointment, now);

  if (bookedCount >= totalSlots && totalSlots > 0) {
    const s = appointment.status?.toLowerCase();
    if (s === 'booked') return 'Booked';
    return 'Fully staffed';
  }
  
  if (isReplacement || filters.needsReplacement) return 'Needs replacement';
  if (filters.hasPendingOffer) return 'Offer awaiting response';
  if (bookedCount > 0 && bookedCount < totalSlots) return 'Partially staffed';
  
  return 'Unfilled / draft';
}

export function getStatusFilters(appointment: Appointment, now: number = Date.now()) {
  const { bookedCount, totalSlots, isReplacement } = getStaffingRatio(appointment);
  
  const isPastStart = appointment.startsAt ? now >= new Date(appointment.startsAt).getTime() : false;
  const isPastEnd = appointment.endsAt ? now > new Date(appointment.endsAt).getTime() : false;
  const isCancelled = appointment.state === 'cancelled' || appointment.status?.toLowerCase() === 'cancelled';
  
  const activeSlots = appointment.slots?.filter(s => s.active) || [];
  
  // A pending offer must be active (not expired and before appointment end)
  const hasPendingOffer = !isPastEnd && (
    (appointment.offers || []).some(o => 
      (o.state === 'pending' || o.status === 'pending') && 
      o.state !== 'expired' &&
      o.status !== 'expired' &&
      (new Date(o.expiresAt).getTime() > now)
    ) || (appointment.pendingOffer === true) || (appointment.status?.toLowerCase().includes('awaiting response'))
  );
  
  const fullyStaffed = !isCancelled && bookedCount >= totalSlots && totalSlots > 0;
  
  const needsReplacement = !isCancelled && !fullyStaffed && (
    isReplacement ||
    (isNeedsReplacementStatus(appointment.status) && !hasPendingOffer) ||
    (activeSlots.some(s => s.needsReplacement && !s.reservedBy) && bookedCount < totalSlots)
  );

  const partiallyStaffed = !isCancelled && !needsReplacement && bookedCount > 0 && bookedCount < totalSlots;
  const needingCoverage = !isPastStart && !isCancelled && bookedCount < totalSlots && !hasPendingOffer && !needsReplacement;
  const staffFollowUp = !isCancelled && isPastEnd && activeSlots.some(s => s.followUp);

  return {
    isCancelled,
    isPastStart,
    isPastEnd,
    needingCoverage,
    hasPendingOffer,
    partiallyStaffed,
    fullyStaffed,
    needsReplacement,
    staffFollowUp
  };
}
