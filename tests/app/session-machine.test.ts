import { describe, expect, it } from 'vitest';
import { SessionMachine } from '../../src/app/session-machine';

describe('SessionMachine', () => {
  it('follows the documented first-run path', () => {
    const machine = new SessionMachine();
    expect(machine.transition('PERMISSION_REQUIRED', 'tap AR')).toBe(true);
    expect(machine.transition('INITIALIZING', 'camera')).toBe(true);
    expect(machine.transition('SCANNING', 'camera ready')).toBe(true);
    expect(machine.transition('FREE_PLACEMENT', 'ghost')).toBe(true);
    expect(machine.transition('FREE_UNBOUND', 'place')).toBe(true);
    expect(machine.canEdit()).toBe(true);
    expect(machine.transition('BINDING', 'bind')).toBe(true);
    expect(machine.canEdit()).toBe(false);
    expect(machine.transition('BOUND_TRACKING', 'stable marker')).toBe(true);
    expect(machine.isBound()).toBe(true);
  });

  it('rejects impossible transitions without changing state', () => {
    const machine = new SessionMachine();
    expect(machine.transition('BOUND_TRACKING', 'cheat')).toBe(false);
    expect(machine.current).toBe('STARTING');
  });

  it('goes through limited tracking and back', () => {
    const machine = new SessionMachine();
    machine.transition('PERMISSION_REQUIRED', 'ar');
    machine.transition('INITIALIZING', 'camera');
    machine.transition('NEEDS_RELOCALIZATION', 'saved marker');
    machine.transition('RELOCALIZING', 'scan');
    machine.transition('BOUND_TRACKING', 'found');
    expect(machine.canEdit()).toBe(true);
    machine.transition('TRACKING_LIMITED', 'drift');
    expect(machine.canEdit()).toBe(false);
    machine.transition('BOUND_TRACKING', 'recovered');
    expect(machine.canEdit()).toBe(true);
  });

  it('allows the desktop fallback from every error state', () => {
    for (const state of ['CAMERA_DENIED', 'UNSUPPORTED', 'ENGINE_ERROR'] as const) {
      const machine = new SessionMachine();
      machine.force(state, 'test');
      expect(machine.transition('DESKTOP_3D', 'fallback')).toBe(true);
    }
  });
});
