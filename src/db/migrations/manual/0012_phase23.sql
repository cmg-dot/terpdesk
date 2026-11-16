-- Phase 23 (interpreter feedback). Applied by hand like 0006 to 0011, to production and terpdesk_demo. Idempotent and additive:
-- nullable columns and a partial unique index only, so code that predates them keeps working.
--
-- notifications.kind                 what an in-app notice is about ("booking_added", "booking_cancelled", ...), so the
--                                    interpreter's top banner can pick the ones it shows; NULL = an ordinary bell notice.
-- notifications.banner_dismissed_at  when the interpreter closed it on the banner (the bell keeps it).
-- offers.travel_requested            the interpreter's answer to "Do you need travel time?" when accepting; NULL = not asked.
-- offers.travel_minutes              how much travel time they asked for (0 to 24 hours).
-- offers.availability_note           an optional partial-availability note given on acceptance ("10:00-11:00 AM only").
-- offers.agency_acknowledged_at      when staff dismissed the "accepted" action banner for this offer.
-- credentials.insurance_kind         'liability' or 'commercial_auto' for the two dedicated insurance sections; NULL otherwise.
-- credentials.coverage_limits        the policy limits as written ("$1,000,000 / $2,000,000").

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS kind varchar(40);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS banner_dismissed_at timestamptz;

ALTER TABLE offers ADD COLUMN IF NOT EXISTS travel_requested boolean;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS travel_minutes integer CHECK (travel_minutes BETWEEN 0 AND 1440);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS availability_note varchar(500);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS agency_acknowledged_at timestamptz;

ALTER TABLE credentials ADD COLUMN IF NOT EXISTS insurance_kind varchar(30);
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS coverage_limits varchar(200);
CREATE UNIQUE INDEX IF NOT EXISTS credentials_one_active_insurance_idx
  ON credentials (interpreter_id, insurance_kind) WHERE insurance_kind IS NOT NULL AND NOT is_archived;

-- Bookings that already exist are not "new" for the agency's action banner.
UPDATE offers SET agency_acknowledged_at = now() WHERE status = 'accepted' AND agency_acknowledged_at IS NULL;
