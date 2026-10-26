import { applyCommand } from './commands';
import {
  CONVEYOR_MOVE_SECONDS,
  EXTRACTOR_CYCLE_SECONDS,
  FIXED_DT,
  MAX_FRAME_DELTA_SECONDS,
  MAX_STEPS_PER_FRAME,
  PART_PRICE_CREDITS,
  PROCESSOR_CYCLE_SECONDS,
} from './constants';
import { getEnergyStats } from './economy';
import { sortedBuildings } from './grid';
import { commitTransfers, planTransfers } from './logistics';
import { cloneFactoryState } from './state';
import type {
  DomainError,
  FactoryCommand,
  FactoryEngine as FactoryEngineContract,
  FactoryState,
  Result,
  SimulationEvent,
  Unsubscribe,
} from './types';
import { ok } from './types';

const EPSILON = 1e-9;

export interface StepResult {
  state: FactoryState;
  events: SimulationEvent[];
}

export function simulateStep(state: FactoryState, dtSeconds: number): StepResult {
  if (state.isPaused) return { state, events: [] };
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return { state, events: [] };

  const next = cloneFactoryState(state);
  next.simulationTimeSeconds += dtSeconds;
  const energy = getEnergyStats(next);
  const brownout = energy.brownout;
  const events: SimulationEvent[] = [];

  for (const building of sortedBuildings(next.buildings)) {
    if (!building.enabled) continue;

    switch (building.type) {
      case 'generator':
        break;

      case 'extractor': {
        if (brownout) break;
        if (building.buffer.length < 1) {
          building.progress += dtSeconds;
          if (building.progress + EPSILON >= EXTRACTOR_CYCLE_SECONDS) {
            building.progress = Math.max(0, building.progress - EXTRACTOR_CYCLE_SECONDS);
            building.buffer.push('ore');
            events.push({
              type: 'ore-produced',
              buildingId: building.id,
              at: next.simulationTimeSeconds,
            });
          }
        } else {
          // Hold at "ready" while the output is blocked.
          building.progress = Math.min(building.progress, EXTRACTOR_CYCLE_SECONDS);
        }
        break;
      }

      case 'processor': {
        if (brownout) break;
        if (building.buffer.length > 0) {
          building.progress += dtSeconds;
          if (building.progress + EPSILON >= PROCESSOR_CYCLE_SECONDS) {
            building.progress = Math.max(0, building.progress - PROCESSOR_CYCLE_SECONDS);
            building.buffer.shift();
            next.credits += PART_PRICE_CREDITS;
            next.totalPartsSold += 1;
            events.push({
              type: 'part-sold',
              buildingId: building.id,
              credits: PART_PRICE_CREDITS,
              totalPartsSold: next.totalPartsSold,
              at: next.simulationTimeSeconds,
            });
          }
        } else {
          building.progress = 0;
        }
        break;
      }

      case 'conveyor': {
        if (brownout) break;
        if (building.buffer.length > 0) {
          building.progress = Math.min(
            CONVEYOR_MOVE_SECONDS,
            building.progress + dtSeconds,
          );
        } else {
          building.progress = 0;
        }
        break;
      }
    }
  }

  if (!brownout) {
    const intents = planTransfers(next, brownout);
    events.push(...commitTransfers(next, intents));
  }

  return { state: next, events };
}

/**
 * One authoritative FactoryEngine per game session. The renderer and UI only read
 * state and dispatch commands; they never advance production on their own.
 */
export class FactoryEngine implements FactoryEngineContract {
  private current: FactoryState;
  private readonly listeners = new Set<(state: Readonly<FactoryState>) => void>();
  private pendingEvents: SimulationEvent[] = [];

  constructor(initialState: FactoryState) {
    this.current = initialState;
  }

  get state(): Readonly<FactoryState> {
    return this.current;
  }

  dispatch(command: FactoryCommand): Result<void, DomainError> {
    const result = applyCommand(this.current, command);
    if (!result.ok) return result;
    if (result.value !== this.current) {
      this.current = result.value;
      this.emit();
    }
    return ok(undefined);
  }

  step(dtSeconds: number): void {
    const result = simulateStep(this.current, dtSeconds);
    if (result.state === this.current) return;
    this.current = result.state;
    if (result.events.length > 0) {
      this.pendingEvents.push(...result.events);
      // Keep memory bounded if nobody consumes events (e.g. background tab).
      if (this.pendingEvents.length > 500) {
        this.pendingEvents.splice(0, this.pendingEvents.length - 500);
      }
    }
    this.emit();
  }

  subscribe(listener: (state: Readonly<FactoryState>) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Replace state after save import / load. Does not create a second simulation. */
  replaceState(state: FactoryState): void {
    this.current = state;
    this.pendingEvents = [];
    this.emit();
  }

  consumeEvents(): SimulationEvent[] {
    if (this.pendingEvents.length === 0) return [];
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.current);
      } catch (error) {
        console.error('[factory] state listener failed', error);
      }
    }
  }
}

/**
 * Fixed-timestep driver. Frame time is clamped and at most MAX_STEPS_PER_FRAME
 * simulation steps are executed per rendered frame; leftovers are dropped on lag.
 */
export class FixedStepClock {
  private accumulator = 0;
  private totalSteps = 0;

  update(frameDeltaSeconds: number, step: (dt: number) => void): number {
    const clamped = Number.isFinite(frameDeltaSeconds)
      ? Math.min(Math.max(frameDeltaSeconds, 0), MAX_FRAME_DELTA_SECONDS)
      : 0;
    this.accumulator += clamped;
    let steps = 0;
    while (this.accumulator + EPSILON >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps += 1;
      this.totalSteps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    return steps;
  }

  reset(): void {
    this.accumulator = 0;
  }

  get pendingSeconds(): number {
    return this.accumulator;
  }

  get stepsExecuted(): number {
    return this.totalSteps;
  }
}
