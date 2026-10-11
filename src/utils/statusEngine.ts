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

export function getStaffingRatio(appointment: Appointment) {
  const activeSlots = appointment.slots?.filter(s => s.active) || [];
  const totalSlots = activeSlots.length || (appointment.requiredPositions || 1); // fallback to legacy
  let bookedSlots = activeSlots.filter(s => s.reservedBy !== null);
  let bookedCount = bookedSlots.length || (appointment.acceptedInterpretersCount || 0);

  // Check offers for accepted state
  if (bookedCount === 0 && appointment.offers && Array.isArray(appointment.offers)) {
    const acceptedOffers = appointment.offers.filter(
      (o: any) => o.status === 'accepted' || o.state === 'accepted'
    );
    if (acceptedOffers.length > 0) {
      bookedCount = acceptedOffers.length;
      bookedSlots = acceptedOffers.map((o: any) => ({
        id: o.id || 'accepted-offer',
        active: true,
        reservedBy: o.interpreterId || 'interpreter',
        interpreterName: o.interpreterName || 'Booked',
        needsReplacement: false,
        followUp: false
      }));
    }
  }

  // Check appointment.hasAcceptedOffer, booked/assigned status, or assigned interpreter
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

  return { bookedCount, totalSlots, bookedSlots };
}

export function getStaffingLabel(appointment: Appointment, now: number = Date.now()): string {
  if (appointment.state === 'cancelled' || appointment.status?.toLowerCase() === 'cancelled') {
    return 'Cancelled';
  }
  
  const { bookedCount, totalSlots } = getStaffingRatio(appointment);
  const filters = getStatusFilters(appointment, now);
  
  if (isNeedsReplacementStatus(appointment.status)) return 'Needs replacement';

  if (bookedCount >= totalSlots && totalSlots > 0) {
    const s = appointment.status?.toLowerCase();
    if (s === 'booked') return 'Booked';
    return 'Fully staffed';
  }
  if (filters.hasPendingOffer) return 'Offer awaiting response';
  if (filters.needsReplacement) return 'Needs replacement';
  if (bookedCount > 0) return 'Partially staffed';
  
  return 'Unfilled / draft';
}

export function getStatusFilters(appointment: Appointment, now: number = Date.now()) {
  const { bookedCount, totalSlots } = getStaffingRatio(appointment);
  
  const isPastStart = appointment.startsAt ? now >= new Date(appointment.startsAt).getTime() : false;
  const isPastEnd = appointment.endsAt ? now > new Date(appointment.endsAt).getTime() : false;
  const isCancelled = appointment.state === 'cancelled' || appointment.status?.toLowerCase() === 'cancelled';
  
  const activeSlots = appointment.slots?.filter(s => s.active) || [];
  
  // A pending offer must be active (not expired)
  const hasPendingOffer = (appointment.offers || []).some(o => 
    o.state === 'pending' && (new Date(o.expiresAt).getTime() > now)
  ) || (appointment.pendingOffer === true) || (appointment.status?.toLowerCase().includes('awaiting response'));
  
  const needingCoverage = !isPastStart && !isCancelled && bookedCount < totalSlots && !hasPendingOffer;
  
  const needsReplacement = !isCancelled && (
    isNeedsReplacementStatus(appointment.status) ||
    (activeSlots.some(s => s.needsReplacement && !s.reservedBy) && bookedCount < totalSlots)
  );
  
  const staffFollowUp = !isCancelled && isPastEnd && activeSlots.some(s => s.followUp);

  const fullyStaffed = !isCancelled && bookedCount >= totalSlots && totalSlots > 0;

  return {
    isCancelled,
    isPastStart,
    isPastEnd,
    needingCoverage,
    hasPendingOffer,
    fullyStaffed,
    needsReplacement,
    staffFollowUp
  };
}
