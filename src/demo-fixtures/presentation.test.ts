import { describe, expect, it } from 'vitest';
import { createInitialDemoState, FIXTURE_IDS as ids } from './index';

describe('seed presentation', () => {
  it('uses natural names and coherent reserved addresses without changing identities', () => {
    const state = createInitialDemoState();
    const member = state.members.find(
      (item) => item.memberId === ids.members.maple,
    )!;
    expect(member.displayName).toBe('Maya Chen');
    expect(member.verifiedEmail).toBe('maya.chen@example.invalid');
    expect(
      state.staffAccounts.find((item) => item.staffId === ids.staff.coach)
        ?.coachProfile?.displayName,
    ).toBe('Alex Rivera');
    expect(state.classTypes.map((item) => item.name)).toEqual([
      'Power Intervals',
      'Rowing Foundations',
      'Endurance Row',
    ]);
    for (const signature of state.waiverSignatures) {
      expect(signature.typedName).toBe(
        state.members.find((item) => item.memberId === signature.memberId)
          ?.displayName,
      );
    }
    for (const notification of state.notifications) {
      const recipient = notification.recipient;
      if (recipient.kind === 'member') {
        expect(recipient.email).toBe(
          state.members.find((item) => item.memberId === recipient.memberId)
            ?.verifiedEmail,
        );
      }
    }
  });
});
