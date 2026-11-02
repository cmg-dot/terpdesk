/**
 * The ONE rule for whether an interpreter is a "Registered app user" or a "Shadow / external profile". Every screen that
 * shows or acts on that status must call this, so the roster list, the interpreter's profile page and the Manage access
 * dialog can never disagree.
 *
 * Registered = a login is linked to the profile (interpreters.user_id). It is set when someone registers, or when they
 * confirm their email to claim a profile an agency created. Anything else is a shadow/external profile, including every
 * person created by the agency's CSV or Excel bulk import until they claim it. Having a profile row, an email address or
 * a roster entry says nothing about whether a login exists, so none of those count. Pure: safe in client components.
 */
export const isRegisteredInterpreter = (interpreter: { userId?: string | null }): boolean =>
  typeof interpreter.userId === "string" && interpreter.userId !== "";
