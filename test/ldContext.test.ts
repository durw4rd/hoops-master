import { describe, expect, it } from 'vitest';
import { buildLdContext } from '@/lib/ldContext';

const base = { sessionId: 's1', deviceType: 'desktop', browser: 'chrome' };

describe('buildLdContext', () => {
  it('returns a session-only context when logged out', () => {
    const ctx = buildLdContext(base);
    expect(ctx.kind).toBe('session');
  });

  it('adds a user kind with appRole + crewRole when logged in', () => {
    const ctx = buildLdContext({ ...base, email: 'a@b.co', name: 'Ada', appRole: 'admin', crewRole: 'coleader' });
    if (ctx.kind !== 'multi') throw new Error('expected multi-context');
    expect(ctx.user.key).toBe('a@b.co');
    expect(ctx.user.email).toBe('a@b.co');
    expect(ctx.user.name).toBe('Ada');
    expect(ctx.user.appRole).toBe('admin');
    expect(ctx.user.crewRole).toBe('coleader');
  });

  it('defaults appRole=user and crewRole=none, name falls back to email', () => {
    const ctx = buildLdContext({ ...base, email: 'a@b.co' });
    if (ctx.kind !== 'multi') throw new Error('expected multi-context');
    expect(ctx.user.appRole).toBe('user');
    expect(ctx.user.crewRole).toBe('none');
    expect(ctx.user.name).toBe('a@b.co');
  });
});
