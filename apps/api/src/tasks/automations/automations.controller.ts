import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../../auth/types';
import type { AutomationActor } from './automation-types';
import { TasksService } from '../tasks.service';
import { AutomationRuntimeService } from './automation-runtime.service';
import { AutomationsService } from './automations.service';
import { GoogleDocsService } from './google-docs.service';
import { GoogleSheetsService } from './google-sheets.service';
import { AppendGoogleDocDto, CreateGoogleDocDto } from './dto/google-docs.dto';
import { AppendGoogleSheetDto, CreateGoogleSheetDto } from './dto/google-sheets.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';
import { AUTOMATION_OPERATIONS } from './schemas/automation-operations';
import { CREATE_AUTOMATION_RESPONSES } from './schemas/create-automation.responses';
import { UPDATE_AUTOMATION_RESPONSES } from './schemas/update-automation.responses';

@ApiTags('Task Automations')
@Controller({ path: 'tasks/:taskId/automations', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class AutomationsController {
  constructor(
    private readonly automationsService: AutomationsService,
    private readonly automationRuntimeService: AutomationRuntimeService,
    private readonly tasksService: TasksService,
    private readonly googleDocsService: GoogleDocsService,
    private readonly googleSheetsService: GoogleSheetsService,
  ) {}

  @Get()
  @RequirePermission('task', 'read')
  @ApiOperation({
    summary: 'Get all automations for a task',
    description: 'Retrieve all automations for a specific task',
  })
  @ApiParam({
    name: 'taskId',
    description: 'Unique task identifier',
    example: 'tsk_abc123def456',
  })
  @ApiResponse({
    status: 200,
    description: 'Automations retrieved successfully',
  })
  async getTaskAutomations(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
  ) {
    // Verify task access first
    await this.tasksService.verifyTaskAccess(organizationId, taskId);

    return this.automationsService.findByTaskId({ organizationId, taskId });
  }

  @Get('service-state')
  @RequirePermission('task', 'read')
  @ApiOperation({
    summary: 'Get task automation service state',
    description:
      'Report whether first-party task automation generation and execution are available for this task.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'Unique task identifier',
    example: 'tsk_abc123def456',
  })
  @ApiResponse({
    status: 200,
    description: 'Automation service state retrieved successfully',
  })
  async getAutomationServiceState(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.automationRuntimeService.getServiceState();
  }

  @Get(':automationId')
  @RequirePermission('task', 'read')
  @ApiOperation({
    summary: 'Get automation details',
    description: 'Retrieve details for a specific automation',
  })
  @ApiParam({
    name: 'taskId',
    description: 'Unique task identifier',
    example: 'tsk_abc123def456',
  })
  @ApiParam({
    name: 'automationId',
    description: 'Unique automation identifier',
    example: 'auto_abc123def456',
  })
  @ApiResponse({
    status: 200,
    description: 'Automation details retrieved successfully',
  })
  async getAutomation(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
  ) {
    // Verify task access first
    await this.tasksService.verifyTaskAccess(organizationId, taskId);

    return this.automationsService.findById({
      organizationId,
      taskId,
      automationId,
    });
  }

  @Post()
  @RequirePermission('task', 'update')
  @ApiOperation(AUTOMATION_OPERATIONS.createAutomation)
  @ApiParam({
    name: 'taskId',
    description: 'Unique task identifier',
    example: 'tsk_abc123def456',
  })
  @ApiResponse(CREATE_AUTOMATION_RESPONSES[201])
  @ApiResponse(CREATE_AUTOMATION_RESPONSES[400])
  @ApiResponse(CREATE_AUTOMATION_RESPONSES[401])
  @ApiResponse(CREATE_AUTOMATION_RESPONSES[404])
  async createAutomation(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('taskId') taskId: string,
  ) {
    // Verify task access first
    await this.tasksService.verifyTaskAccess(organizationId, taskId);

    return this.automationsService.create({
      organizationId,
      taskId,
      actor: await this.resolveAutomationActor(organizationId, authContext),
    });
  }

  @Patch(':automationId')
  @RequirePermission('task', 'update')
  @ApiOperation(AUTOMATION_OPERATIONS.updateAutomation)
  @ApiParam({
    name: 'taskId',
    description: 'Unique task identifier',
    example: 'tsk_abc123def456',
  })
  @ApiParam({
    name: 'automationId',
    description: 'Unique automation identifier',
    example: 'auto_abc123def456',
  })
  @ApiResponse(UPDATE_AUTOMATION_RESPONSES[200])
  @ApiResponse(UPDATE_AUTOMATION_RESPONSES[400])
  @ApiResponse(UPDATE_AUTOMATION_RESPONSES[401])
  @ApiResponse(UPDATE_AUTOMATION_RESPONSES[404])
  async updateAutomation(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Body() updateAutomationDto: UpdateAutomationDto,
  ) {
    // Verify task access first
    await this.tasksService.verifyTaskAccess(organizationId, taskId);

    return this.automationsService.update({
      organizationId,
      taskId,
      automationId,
      data: updateAutomationDto,
      actor: await this.resolveAutomationActor(organizationId, authContext),
    });
  }

  @Delete(':automationId')
  @RequirePermission('task', 'update')
  @ApiOperation({
    summary: 'Delete an automation',
    description: 'Delete a specific automation and all its associated data',
  })
  @ApiParam({
    name: 'taskId',
    description: 'Unique task identifier',
    example: 'tsk_abc123def456',
  })
  @ApiParam({
    name: 'automationId',
    description: 'Unique automation identifier',
    example: 'auto_abc123def456',
  })
  @ApiResponse({
    status: 200,
    description: 'Automation deleted successfully',
  })
  async deleteAutomation(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
  ) {
    // Verify task access first
    await this.tasksService.verifyTaskAccess(organizationId, taskId);

    return this.automationsService.delete({
      organizationId,
      taskId,
      automationId,
      actor: await this.resolveAutomationActor(organizationId, authContext),
    });
  }

  @Get(':automationId/runs')
  @RequirePermission('task', 'read')
  @ApiOperation({
    summary: 'Get all runs for a specific automation',
    description: 'Retrieve all runs for a specific automation',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  @ApiResponse({ status: 200, description: 'Runs retrieved successfully' })
  async getAutomationRuns(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.automationsService.findRunsByAutomationId({
      organizationId,
      taskId,
      automationId,
    });
  }

  @Get(':automationId/chat-history')
  @RequirePermission('task', 'read')
  @ApiOperation({
    summary: 'Get first-party automation builder chat history',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  async getChatHistory(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.automationsService.getChatHistory({
      organizationId,
      taskId,
      automationId,
      offset: offset ? Math.max(0, parseInt(offset, 10) || 0) : 0,
      limit: limit ? Math.min(100, Math.max(1, parseInt(limit, 10) || 50)) : 50,
    });
  }

  @Post(':automationId/chat-history')
  @RequirePermission('task', 'update')
  @ApiOperation({
    summary: 'Save first-party automation builder chat history',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  async saveChatHistory(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Body() body: { messages?: unknown[] },
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.automationsService.saveChatHistory({
      organizationId,
      taskId,
      automationId,
      messages: body.messages ?? [],
      actor: await this.resolveAutomationActor(organizationId, authContext),
    });
  }

  @Post(':automationId/runs')
  @RequirePermission('task', 'update')
  @ApiOperation({
    summary: 'Start a manual run for a published automation version',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  async startManualRun(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Body()
    body: {
      version: number;
      secretRefs?: { name: string; category?: string }[];
    },
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.automationsService.startManualRun({
      organizationId,
      taskId,
      automationId,
      version: body.version,
      secretRefs: body.secretRefs,
      actor: await this.resolveAutomationActor(organizationId, authContext),
    });
  }

  @Get(':automationId/versions')
  @RequirePermission('task', 'read')
  @ApiOperation({
    summary: 'Get all versions for an automation',
    description: 'Retrieve all published versions of an automation script',
  })
  @ApiParam({
    name: 'taskId',
    description: 'Task ID',
  })
  @ApiParam({
    name: 'automationId',
    description: 'Automation ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Versions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        versions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              version: { type: 'number' },
              scriptKey: { type: 'string' },
              changelog: { type: 'string', nullable: true },
              publishedBy: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  async getAutomationVersions(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    const parsedLimit = limit ? parseInt(limit) : undefined;
    const parsedOffset = offset ? parseInt(offset) : undefined;
    return this.automationsService.listVersions({
      organizationId,
      taskId,
      automationId,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }

  @Get(':automationId/draft-script')
  @RequirePermission('task', 'read')
  @ApiOperation({ summary: 'Get automation draft script content' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  async getDraftScript(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.automationsService.getDraftScript({
      organizationId,
      taskId,
      automationId,
    });
  }

  @Post(':automationId/draft-script/run')
  @RequirePermission('task', 'update')
  @ApiOperation({ summary: 'Run the current draft script as a test run' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  async runDraftScript(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Body() body: { secretRefs?: { name: string; category?: string }[] },
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.automationsService.runDraftScript({
      organizationId,
      taskId,
      automationId,
      secretRefs: body.secretRefs,
      actor: await this.resolveAutomationActor(organizationId, authContext),
    });
  }

  @Put(':automationId/draft-script')
  @RequirePermission('task', 'update')
  @ApiOperation({ summary: 'Save automation draft script content' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  async saveDraftScript(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Body() body: { content: string },
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.automationsService.saveDraftScript({
      organizationId,
      taskId,
      automationId,
      content: body.content,
    });
  }

  @Post(':automationId/versions')
  @RequirePermission('task', 'update')
  @ApiOperation({
    summary: 'Create a published version record for an automation',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  async createVersion(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Body() body: { scriptKey: string; changelog?: string },
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.automationsService.createVersion({
      organizationId,
      taskId,
      automationId,
      data: body,
      actor: await this.resolveAutomationActor(organizationId, authContext),
    });
  }

  @Post(':automationId/versions/:version/restore')
  @RequirePermission('task', 'update')
  @ApiOperation({
    summary: 'Restore a published automation version into a draft reference',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  @ApiParam({ name: 'version', description: 'Published version number' })
  async restoreVersion(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Param('version') version: string,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.automationsService.restoreVersion({
      organizationId,
      taskId,
      automationId,
      version: parseInt(version),
      actor: await this.resolveAutomationActor(organizationId, authContext),
    });
  }

  @Post(':automationId/google-docs')
  @RequirePermission('task', 'update')
  @ApiOperation({ summary: 'Create a Google Doc and write evidence content into it' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  async createGoogleDoc(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Body() body: CreateGoogleDocDto,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.googleDocsService.createDocument({
      organizationId,
      title: body.title,
      content: body.content,
    });
  }

  @Post(':automationId/google-docs/:documentId/append')
  @RequirePermission('task', 'update')
  @ApiOperation({ summary: 'Append evidence content to an existing Google Doc' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  @ApiParam({ name: 'documentId', description: 'Google Docs document ID' })
  async appendToGoogleDoc(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('documentId') documentId: string,
    @Body() body: AppendGoogleDocDto,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.googleDocsService.appendToDocument({
      organizationId,
      documentId,
      content: body.content,
    });
  }

  @Post(':automationId/google-sheets')
  @RequirePermission('task', 'update')
  @ApiOperation({ summary: 'Create a Google Spreadsheet and write evidence rows into it' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  async createGoogleSheet(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Body() body: CreateGoogleSheetDto,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.googleSheetsService.createSpreadsheet({
      organizationId,
      title: body.title,
      headers: body.headers,
      rows: body.rows,
    });
  }

  @Post(':automationId/google-sheets/:spreadsheetId/append')
  @RequirePermission('task', 'update')
  @ApiOperation({ summary: 'Append evidence rows to an existing Google Spreadsheet' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Google Sheets spreadsheet ID' })
  async appendGoogleSheet(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Body() body: AppendGoogleSheetDto,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.googleSheetsService.appendRows({
      organizationId,
      spreadsheetId,
      rows: body.rows,
    });
  }

  @Get(':automationId/google-docs/:documentId')
  @RequirePermission('task', 'read')
  @ApiOperation({ summary: 'Read the text content of a Google Doc' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  @ApiParam({ name: 'documentId', description: 'Google Docs document ID' })
  async readGoogleDoc(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('documentId') documentId: string,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.googleDocsService.readDocument({ organizationId, documentId });
  }

  @Get(':automationId/google-sheets/:spreadsheetId')
  @RequirePermission('task', 'read')
  @ApiOperation({ summary: 'Read values from a Google Spreadsheet' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'automationId', description: 'Automation ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Google Sheets spreadsheet ID' })
  async readGoogleSheet(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Query('range') range?: string,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.googleSheetsService.readValues({ organizationId, spreadsheetId, range });
  }

  private async resolveAutomationActor(
    organizationId: string,
    authContext: AuthContextType,
  ): Promise<AutomationActor> {
    if (authContext.userId) {
      return {
        userId: authContext.userId,
        memberId: authContext.memberId,
      };
    }

    return {
      userId: await this.tasksService.getApiKeyActorUserId(organizationId),
      memberId: null,
    };
  }

  // ==================== AUTOMATION RUNS (per task) ====================

  @Get('runs')
  @RequirePermission('task', 'read')
  @ApiOperation({
    summary: 'Get all automation runs for a task',
    description:
      'Retrieve all evidence automation runs across automations for a specific task',
  })
  @ApiParam({
    name: 'taskId',
    description: 'Task ID',
    example: 'tsk_abc123def456',
  })
  @ApiResponse({
    status: 200,
    description: 'Automation runs retrieved successfully',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'ear_abc123def456' },
              status: {
                type: 'string',
                enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'],
              },
              trigger: {
                type: 'string',
                enum: ['MANUAL', 'SCHEDULED', 'EVENT'],
              },
              createdAt: { type: 'string', format: 'date-time' },
              completedAt: {
                type: 'string',
                format: 'date-time',
                nullable: true,
              },
              error: { type: 'object', nullable: true },
            },
          },
        },
      },
    },
  })
  async getTaskAutomationRuns(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return await this.tasksService.getTaskAutomationRuns(
      organizationId,
      taskId,
    );
  }

  @Get('runs/:runId')
  @RequirePermission('task', 'read')
  async getTaskAutomationRun(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('runId') runId: string,
  ) {
    return this.tasksService.getAutomationRunById(organizationId, taskId, runId);
  }
}
