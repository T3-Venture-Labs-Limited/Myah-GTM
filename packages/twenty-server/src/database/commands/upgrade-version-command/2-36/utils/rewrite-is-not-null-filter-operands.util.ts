import { isDefined } from 'twenty-shared/utils';

const LEGACY_NOT_NULL_OPERANDS: Record<string, true> = {
  IS_NOT_NULL: true,
  isNotNull: true,
};

const rewriteStepFilters = (
  container: unknown,
): { value: unknown; changed: boolean } => {
  if (
    typeof container !== 'object' ||
    container === null ||
    Array.isArray(container) ||
    !('stepFilters' in container) ||
    !Array.isArray(container.stepFilters)
  ) {
    return { value: container, changed: false };
  }

  let changed = false;
  const stepFilters = container.stepFilters.map((filter) => {
    if (
      typeof filter !== 'object' ||
      filter === null ||
      Array.isArray(filter) ||
      !('operand' in filter) ||
      typeof filter.operand !== 'string' ||
      LEGACY_NOT_NULL_OPERANDS[filter.operand] !== true
    ) {
      return filter;
    }

    changed = true;

    return { ...filter, operand: 'IS_NOT_EMPTY' };
  });

  return changed
    ? { value: { ...container, stepFilters }, changed: true }
    : { value: container, changed: false };
};

const rewriteWorkflowStep = (
  step: unknown,
): { value: unknown; changed: boolean } => {
  if (
    typeof step !== 'object' ||
    step === null ||
    Array.isArray(step) ||
    !('settings' in step) ||
    typeof step.settings !== 'object' ||
    step.settings === null ||
    Array.isArray(step.settings) ||
    !('input' in step.settings)
  ) {
    return { value: step, changed: false };
  }

  const input = step.settings.input;
  const migratedInput = rewriteStepFilters(input);

  if (!migratedInput.changed) {
    return { value: step, changed: false };
  }

  return {
    value: {
      ...step,
      settings: {
        ...step.settings,
        input: migratedInput.value,
      },
    },
    changed: true,
  };
};

const rewriteWorkflowTrigger = (
  trigger: unknown,
): { value: unknown; changed: boolean } => {
  if (
    typeof trigger !== 'object' ||
    trigger === null ||
    Array.isArray(trigger) ||
    !('settings' in trigger) ||
    typeof trigger.settings !== 'object' ||
    trigger.settings === null ||
    Array.isArray(trigger.settings) ||
    !('filter' in trigger.settings)
  ) {
    return { value: trigger, changed: false };
  }

  const migratedFilter = rewriteStepFilters(trigger.settings.filter);

  if (!migratedFilter.changed) {
    return { value: trigger, changed: false };
  }

  return {
    value: {
      ...trigger,
      settings: {
        ...trigger.settings,
        filter: migratedFilter.value,
      },
    },
    changed: true,
  };
};

export const rewriteIsNotNullFilterOperands = <TValue>(
  value: TValue,
): { value: TValue; changed: boolean } => {
  if (!isDefined(value)) {
    return { value, changed: false };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const steps = value.map((step) => {
      const migratedStep = rewriteWorkflowStep(step);

      changed ||= migratedStep.changed;

      return migratedStep.value;
    });

    return changed
      ? { value: steps as TValue, changed: true }
      : { value, changed: false };
  }

  const directContainer = rewriteStepFilters(value);

  if (directContainer.changed) {
    return { value: directContainer.value as TValue, changed: true };
  }

  const migratedTrigger = rewriteWorkflowTrigger(value);

  if (migratedTrigger.changed) {
    return { value: migratedTrigger.value as TValue, changed: true };
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'filter' in value
  ) {
    const migratedFilter = rewriteStepFilters(value.filter);

    if (migratedFilter.changed) {
      return {
        value: { ...value, filter: migratedFilter.value } as TValue,
        changed: true,
      };
    }
  }

  return { value, changed: false };
};
