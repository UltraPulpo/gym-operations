import type {
  DemoActionPayloads,
  DemoState,
  DemoUnavailableState,
  DomainResult,
  MemberId,
  UtcInstant,
  WaiverCompliance,
  WaiverSignature,
  WaiverVersion,
  WaiverVersionId,
} from './types';

type PublishedWaiver = Extract<WaiverVersion, { readonly status: 'published' }>;

function invalid<T>(field: string, message: string): DomainResult<T> {
  return {
    success: false,
    error: {
      category: 'ValidationError',
      message,
      fields: [{ field, message }],
    },
  };
}

function unavailable(
  resource: 'waiver' | 'member',
  message: string,
  resourceId?: string,
): DemoUnavailableState {
  return {
    category: 'DemoUnavailableState',
    message,
    resource,
    ...(resourceId === undefined ? {} : { resourceId }),
    stale: false,
  };
}

function validInstant(instant: UtcInstant): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(instant)) return false;
  const parsed = new Date(instant);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().replace('.000Z', 'Z') === instant
  );
}

/** Resolves the explicit current publication, never a draft or a guessed version. */
export function getCurrentWaiver(
  state: DemoState,
): DomainResult<PublishedWaiver> {
  const waiver = state.waivers.find(
    (candidate) =>
      candidate.waiverVersionId === state.currentWaiverVersionId &&
      candidate.status === 'published',
  );
  if (!waiver || waiver.status !== 'published') {
    return {
      success: false,
      error: unavailable(
        'waiver',
        'The current published demo waiver is unavailable.',
        state.currentWaiverVersionId ?? undefined,
      ),
    };
  }
  return { success: true, value: waiver };
}

export function createWaiverVersion(
  state: DemoState,
  waiver: WaiverVersion,
): DomainResult<DemoState> {
  if (waiver.status !== 'draft') {
    return invalid('status', 'Create a draft before publishing a demo waiver.');
  }
  if (!waiver.text.trim()) {
    return invalid('text', 'Enter fictional placeholder waiver text.');
  }
  if (!Number.isSafeInteger(waiver.version) || waiver.version < 1) {
    return invalid('version', 'The waiver version must be a positive integer.');
  }
  if (
    state.waivers.some(
      (existing) =>
        existing.waiverVersionId === waiver.waiverVersionId ||
        existing.version === waiver.version,
    )
  ) {
    return invalid('version', 'Waiver version numbers and IDs must be unique.');
  }
  if (!validInstant(waiver.createdAt)) {
    return invalid('createdAt', 'Provide a valid UTC creation timestamp.');
  }
  return {
    success: true,
    value: { ...state, waivers: [...state.waivers, { ...waiver }] },
  };
}

export function publishWaiver(
  state: DemoState,
  waiverVersionId: WaiverVersionId,
  now: UtcInstant,
): DomainResult<DemoState> {
  const waiver = state.waivers.find(
    (candidate) => candidate.waiverVersionId === waiverVersionId,
  );
  if (!waiver) {
    return {
      success: false,
      error: unavailable(
        'waiver',
        'The demo waiver version is unavailable.',
        waiverVersionId,
      ),
    };
  }
  if (waiver.status !== 'draft') {
    return invalid(
      'status',
      'Published waiver evidence cannot be republished.',
    );
  }
  if (!waiver.text.trim()) {
    return invalid('text', 'Enter fictional placeholder waiver text.');
  }
  if (
    !Number.isSafeInteger(waiver.version) ||
    waiver.version < 1 ||
    state.waivers.some(
      (existing) =>
        existing.status === 'published' && existing.version >= waiver.version,
    )
  ) {
    return invalid(
      'version',
      'Publish a version newer than all published versions.',
    );
  }
  if (
    !validInstant(now) ||
    !validInstant(waiver.createdAt) ||
    now < waiver.createdAt
  ) {
    return invalid(
      'publishedAt',
      'Publication requires a valid UTC timestamp at or after creation.',
    );
  }
  const published: PublishedWaiver = {
    ...waiver,
    status: 'published',
    publishedAt: now,
  };
  return {
    success: true,
    value: {
      ...state,
      currentWaiverVersionId: waiverVersionId,
      waivers: state.waivers.map((candidate) =>
        candidate === waiver ? published : candidate,
      ),
    },
  };
}

/** Compliance concerns waiver evidence only; member/actor eligibility is separate. */
export function getWaiverCompliance(
  state: DemoState,
  memberId: MemberId,
): WaiverCompliance {
  const current = getCurrentWaiver(state);
  if (!current.success) {
    return {
      status: 'unavailable',
      error: unavailable(
        'waiver',
        current.error.message,
        state.currentWaiverVersionId ?? undefined,
      ),
    };
  }
  const signatures = state.waiverSignatures.filter(
    (signature) => signature.memberId === memberId,
  );
  const signature = signatures.find(
    (candidate) => candidate.waiverVersionId === current.value.waiverVersionId,
  );
  if (signature) return { status: 'current', signature };
  const latest = signatures.reduce<WaiverSignature | undefined>(
    (previous, candidate) =>
      !previous || candidate.signedAt > previous.signedAt
        ? candidate
        : previous,
    undefined,
  );
  return latest
    ? {
        status: 'outdated',
        signature: latest,
        currentVersionId: current.value.waiverVersionId,
      }
    : {
        status: 'missing',
        currentVersionId: current.value.waiverVersionId,
      };
}

/** Shared waiver gate for new bookings, waitlist promotion, and check-in. */
export function requireCurrentWaiver(
  state: DemoState,
  memberId: MemberId,
): DomainResult<WaiverSignature> {
  const compliance = getWaiverCompliance(state, memberId);
  if (compliance.status === 'unavailable') {
    return { success: false, error: compliance.error };
  }
  if (compliance.status === 'current') {
    return { success: true, value: compliance.signature };
  }
  return {
    success: false,
    error: {
      category: 'IneligibleDemoAction',
      reason:
        compliance.status === 'outdated' ? 'waiverOutdated' : 'waiverMissing',
      message: 'Sign the current demo waiver before booking or checking in.',
      memberId,
    },
  };
}

export function signWaiver(
  state: DemoState,
  input: DemoActionPayloads['signWaiver'],
  now: UtcInstant,
): DomainResult<DemoState> {
  if (!state.members.some((member) => member.memberId === input.memberId)) {
    return {
      success: false,
      error: unavailable(
        'member',
        'The demo member is unavailable.',
        input.memberId,
      ),
    };
  }
  const current = getCurrentWaiver(state);
  if (!current.success) return current;
  if (input.waiverVersionId !== current.value.waiverVersionId) {
    return {
      success: false,
      error: {
        category: 'IneligibleDemoAction',
        reason: 'waiverOutdated',
        message: 'Sign the current published demo waiver version.',
        memberId: input.memberId,
      },
    };
  }
  if (!input.typedName.trim()) {
    return invalid('typedName', 'Enter a typed name to sign the demo waiver.');
  }
  if (
    state.waiverSignatures.some(
      (signature) =>
        signature.signatureId === input.signatureId ||
        (signature.memberId === input.memberId &&
          signature.waiverVersionId === input.waiverVersionId),
    )
  ) {
    return invalid(
      'signatureId',
      'Signature evidence already exists; it cannot be overwritten.',
    );
  }
  if (!validInstant(now) || now < current.value.publishedAt) {
    return invalid(
      'signedAt',
      'Signing requires a valid UTC timestamp at or after publication.',
    );
  }
  const signature: WaiverSignature = {
    signatureId: input.signatureId,
    memberId: input.memberId,
    waiverVersionId: current.value.waiverVersionId,
    typedName: input.typedName,
    signedAt: now,
  };
  return {
    success: true,
    value: {
      ...state,
      waiverSignatures: [...state.waiverSignatures, signature],
    },
  };
}
