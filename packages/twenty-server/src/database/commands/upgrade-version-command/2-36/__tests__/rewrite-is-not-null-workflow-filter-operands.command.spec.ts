import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { RewriteIsNotNullWorkflowFilterOperandsCommand } from 'src/database/commands/upgrade-version-command/2-36/2-36-workspace-command-1787700000000-rewrite-is-not-null-workflow-filter-operands.command';
import { type WorkflowVersionCoreSyncService } from 'src/engine/core-modules/workflow/services/workflow-version-core-sync.service';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkflowVersionWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';

const legacySteps = [
  {
    type: 'IF_ELSE',
    settings: {
      input: {
        stepFilters: [
          { id: 'filter-id', type: 'UUID', operand: 'IS_NOT_NULL', value: '' },
        ],
      },
    },
  },
];

const workflowVersion = {
  id: '00000000-0000-4000-8000-000000000002',
  workflowId: '00000000-0000-4000-8000-000000000003',
  coreWorkflowVersionId: '00000000-0000-4000-8000-000000000004',
  status: 'ACTIVE',
  steps: legacySteps,
  trigger: null,
} as unknown as WorkflowVersionWorkspaceEntity;

describe('RewriteIsNotNullWorkflowFilterOperandsCommand', () => {
  it('migrates workflow versions through the transactional core mirror', async () => {
    const workflowVersionRepository = {
      find: jest.fn().mockResolvedValue([workflowVersion]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const automatedTriggerRepository = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const workspaceOrmManager = {
      getRepository: jest.fn().mockImplementation(async (objectName) => {
        return objectName === 'workflowVersion'
          ? workflowVersionRepository
          : automatedTriggerRepository;
      }),
    } as unknown as WorkspaceOrmManager;
    const workspaceCacheService = {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatObjectMetadataMaps: {
          byUniversalIdentifier: {
            [STANDARD_OBJECTS.workflowVersion.universalIdentifier]: {},
          },
        },
      }),
    } as unknown as WorkspaceCacheService;
    const writeWorkflowVersionAndMirror = jest
      .fn()
      .mockImplementation(async (_workspaceId, write) => {
        await write(workflowVersionRepository);
      });
    const workflowVersionCoreSyncService = {
      writeWorkflowVersionAndMirror,
    } as unknown as WorkflowVersionCoreSyncService;
    const CommandWithCoreSyncConstructor =
      RewriteIsNotNullWorkflowFilterOperandsCommand as unknown as new (
        workspaceIteratorService: WorkspaceIteratorService,
        workspaceOrmManager: WorkspaceOrmManager,
        workspaceCacheService: WorkspaceCacheService,
        workflowVersionCoreSyncService: WorkflowVersionCoreSyncService,
      ) => RewriteIsNotNullWorkflowFilterOperandsCommand;
    const command = new CommandWithCoreSyncConstructor(
      {} as WorkspaceIteratorService,
      workspaceOrmManager,
      workspaceCacheService,
      workflowVersionCoreSyncService,
    );

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      dataSource: {} as never,
      options: {},
      index: 0,
      total: 1,
    });

    expect(workflowVersionRepository.update).toHaveBeenCalledWith(
      workflowVersion.id,
      {
        steps: [
          {
            ...legacySteps[0],
            settings: {
              input: {
                stepFilters: [
                  {
                    id: 'filter-id',
                    type: 'UUID',
                    operand: 'IS_NOT_EMPTY',
                    value: '',
                  },
                ],
              },
            },
          },
        ],
      },
    );
    expect(writeWorkflowVersionAndMirror).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.any(Function),
    );
  });
});
