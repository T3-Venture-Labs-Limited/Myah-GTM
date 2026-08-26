import { isDefined } from 'twenty-shared/utils';

const LEGACY_NOT_NULL_OPERANDS: Record<string, true> = {
  IS_NOT_NULL: true,
  isNotNull: true,
};

const rewriteFilterArray = (
  filters: unknown,
): { value: unknown; changed: boolean } => {
  if (!Array.isArray(filters)) {
    return { value: filters, changed: false };
  }

  let changed = false;
  const migratedFilters = filters.map((filter) => {
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
    ? { value: migratedFilters, changed: true }
    : { value: filters, changed: false };
};

const rewriteStepFilters = (
  container: unknown,
): { value: unknown; changed: boolean } => {
  if (
    typeof container !== 'object' ||
    container === null ||
    Array.isArray(container) ||
    !('stepFilters' in container)
  ) {
    return { value: container, changed: false };
  }

  const migratedFilters = rewriteFilterArray(container.stepFilters);

  return migratedFilters.changed
    ? {
        value: { ...container, stepFilters: migratedFilters.value },
        changed: true,
      }
    : { value: container, changed: false };
};

const rewriteRecordFilters = (
  container: unknown,
): { value: unknown; changed: boolean } => {
  if (
    typeof container !== 'object' ||
    container === null ||
    Array.isArray(container) ||
    !('recordFilters' in container)
  ) {
    return { value: container, changed: false };
  }

  const migratedFilters = rewriteFilterArray(container.recordFilters);

  return migratedFilters.changed
    ? {
        value: { ...container, recordFilters: migratedFilters.value },
        changed: true,
      }
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
  const migratedStepFilters = rewriteStepFilters(input);
  let migratedInput = migratedStepFilters.value;
  let changed = migratedStepFilters.changed;

  if (
    typeof migratedInput === 'object' &&
    migratedInput !== null &&
    !Array.isArray(migratedInput) &&
    'filter' in migratedInput
  ) {
    const migratedRecordFilters = rewriteRecordFilters(migratedInput.filter);

    if (migratedRecordFilters.changed) {
      migratedInput = {
        ...migratedInput,
        filter: migratedRecordFilters.value,
      };
      changed = true;
    }
  }

  if (!changed) {
    return { value: step, changed: false };
  }

  return {
    value: {
      ...step,
      settings: {
        ...step.settings,
        input: migratedInput,
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
